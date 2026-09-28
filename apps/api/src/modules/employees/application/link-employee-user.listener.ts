import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AuditService } from "../../audit";
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
  private readonly logger = new Logger(LinkEmployeeUserListener.name);

  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  // suppressErrors:false: a failure to link must fail the acceptance (the use case rolls back), not be logged and ignored.
  @OnEvent("invitation.accepted", { suppressErrors: false })
  async onInvitationAccepted(event: InvitationAcceptedEvent): Promise<void> {
    const linked = await this.employees.linkUser(event.companyId, event.employeeId, event.userId);
    if (linked) {
      // actorId is the newly created user themselves — accepting their own
      // invitation is what caused this write, a real actor, not a
      // background job (contrast the expiry job's actorId: null convention).
      await this.audit.record(event.companyId, {
        actorId: event.userId,
        action: "link_user",
        entity: "employees",
        entityId: event.employeeId,
        before: { userId: null },
        after: { userId: event.userId },
        ip: null,
      });
    } else {
      // A stale second invitation accepted after the employee was already
      // linked by a first one — the new User account is real and can log in,
      // it just isn't the one this employee record points to. Not corrupted
      // data, just an orphaned extra account; logged so HR can notice and
      // clean it up. See docs/adr/0007-invitations.md for why this doesn't
      // block acceptance instead (would require an auth → employees import).
      this.logger.warn(
        `Employee ${event.employeeId} was already linked to a user; ignoring invitation.accepted for user ${event.userId}`,
      );
    }
  }
}
