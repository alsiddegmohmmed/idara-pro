import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AuditService } from "../../audit";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

/** Event shape as this module understands it — deliberately not imported from employees. */
interface EmployeeDeactivatedEvent {
  companyId: string;
  employeeId: string;
  userId: string | null;
  actorId: string;
  ip: string | null;
}

/**
 * A deactivated employee must not keep access (docs/domain/business-rules.md "Employee onboarding",
 * docs/adr/0008): the user is disabled (login → 401) and every refresh token revoked (no new access
 * tokens). An access token already issued lives out its 15 minutes (ADR-0002). Idempotent.
 */
@Injectable()
export class EmployeeDeactivatedListener {
  private readonly logger = new Logger(EmployeeDeactivatedListener.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly invitations: InvitationsRepository,
    private readonly audit: AuditService,
  ) {}

  // suppressErrors:false — by default @nestjs/event-emitter logs and swallows handler errors,
  // which would let a failed cut-off return 200 to HR. The error must reach the PATCH response.
  @OnEvent("employee.deactivated", { suppressErrors: false })
  async onEmployeeDeactivated(event: EmployeeDeactivatedEvent): Promise<void> {
    // An invitation still in flight would otherwise create a fresh, active account later.
    await this.invitations.expireOutstandingForEmployee(event.companyId, event.employeeId, new Date());
    if (event.userId === null) return; // never had an account
    const previousStatus = await this.users.setStatus(event.companyId, event.userId, "disabled");
    if (previousStatus === null) {
      this.logger.warn(`Deactivated employee ${event.employeeId} points at missing user ${event.userId}`);
      return;
    }
    const revokedSessions = await this.refreshTokens.revokeAllForUser(event.companyId, event.userId);
    await this.audit.record(event.companyId, {
      actorId: event.actorId,
      action: "disable_access",
      entity: "users",
      entityId: event.userId,
      before: { status: previousStatus },
      after: { status: "disabled", reason: "employee_deactivated", employeeId: event.employeeId, revokedSessions },
      ip: event.ip,
    });
  }
}
