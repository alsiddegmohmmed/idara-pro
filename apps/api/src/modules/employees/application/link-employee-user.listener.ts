import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AuditService } from "../../audit";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import {
  EMPLOYEES_REPOSITORY,
  type EmployeesRepositoryPort,
} from "./ports/employees-repository.port";

/** The event's shape as this module understands it — deliberately not
 * imported from the auth module (same reasoning as Stage 2c's
 * DocumentExpiryListener: a listener depends on the event contract, not on
 * the emitting module's own types, keeping employees and auth free of any
 * import in this direction — see docs/adr/0007-invitations.md). */
interface InvitationAcceptedEvent {
  companyId: string;
  employeeId: string;
  userId: string;
}

@Injectable()
export class LinkEmployeeUserListener {
  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  // suppressErrors:false: a refusal must fail the acceptance (which rolls back), not be logged and ignored.
  @OnEvent("invitation.accepted", { suppressErrors: false })
  async onInvitationAccepted(event: InvitationAcceptedEvent): Promise<void> {
    // Runs inside the accept transaction. The row lock makes this check and the link one step with respect
    // to a concurrent deactivation (which holds the same lock): whoever is second sees the other's result.
    const employee = await this.employees.findByIdForUpdate(event.companyId, event.employeeId, "key"); // linking changes the unique user_id
    if (!employee) {
      throw new NotFoundError("Employee not found", "employees.employee.not_found");
    }
    if (employee.userId) {
      throw new BusinessRuleError("employees.already_linked", "This employee already has an account");
    }
    if (employee.status !== "active") {
      throw new BusinessRuleError("employees.inactive", "This employee is no longer active");
    }
    const linked = await this.employees.linkUser(event.companyId, event.employeeId, event.userId);
    if (!linked) {
      throw new BusinessRuleError("employees.already_linked", "This employee already has an account");
    }
    // actorId is the newly created user themselves — accepting their own invitation is what caused this
    // write, a real actor, not a background job (contrast the expiry job's actorId: null convention).
    await this.audit.record(event.companyId, {
      actorId: event.userId,
      action: "link_user",
      entity: "employees",
      entityId: event.employeeId,
      before: { userId: null },
      after: { userId: event.userId },
      ip: null,
    });
  }
}
