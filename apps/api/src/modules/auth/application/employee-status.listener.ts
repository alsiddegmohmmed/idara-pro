import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AuditService } from "../../audit";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

/** Event shape as this module understands it — deliberately not imported from employees. */
interface EmployeeStatusEvent {
  companyId: string;
  employeeId: string;
  userId: string | null;
  actorId: string;
  ip: string | null;
}

/**
 * Deactivation and re-activation of an employee's account (docs/adr/0008).
 *
 * Invariant: an inactive employee has no usable login. Deactivation disables the user (login → 401) and
 * revokes every refresh token; an access token already issued lives out its 15 minutes (ADR-0002).
 * Re-activation restores only what deactivation took away: a user that is `disabled` goes back to
 * `active` (never an `invited` one), and no old session comes back.
 *
 * Every status write is a compare-and-set, so a concurrent change is never overwritten.
 */
@Injectable()
export class EmployeeStatusListener {
  private readonly logger = new Logger(EmployeeStatusListener.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly invitations: InvitationsRepository,
    private readonly audit: AuditService,
  ) {}

  // suppressErrors:false on both handlers — by default @nestjs/event-emitter logs and swallows handler
  // errors, which would let a failed cut-off return 200 to HR. The error must reach the PATCH response.
  @OnEvent("employee.deactivated", { suppressErrors: false })
  async onEmployeeDeactivated(event: EmployeeStatusEvent): Promise<void> {
    // An invitation still in flight would otherwise create a fresh, active account later.
    await this.invitations.expireOutstandingForEmployee(event.companyId, event.employeeId, new Date());
    if (event.userId === null) return; // never had an account

    const user = await this.users.findById(event.companyId, event.userId);
    if (!user) {
      this.logger.warn(`Deactivated employee ${event.employeeId} points at missing user ${event.userId}`);
      return;
    }
    // Sessions first: even if a later step fails, nothing can mint or refresh an access token.
    const revokedSessions = await this.refreshTokens.revokeAllForUser(event.companyId, event.userId);
    // Only an active user is disabled (an "invited" one can't log in anyway and stays as it is).
    const disabled = await this.users.transitionStatus(event.companyId, event.userId, "active", "disabled");
    if (!disabled) return; // already disabled/invited: nothing more to do, and nothing to audit
    await this.audit.record(event.companyId, {
      actorId: event.actorId,
      action: "disable_access",
      entity: "users",
      entityId: event.userId,
      before: { status: "active" },
      after: { status: "disabled", reason: "employee_deactivated", employeeId: event.employeeId, revokedSessions },
      ip: event.ip,
    });
  }

  @OnEvent("employee.reactivated", { suppressErrors: false })
  async onEmployeeReactivated(event: EmployeeStatusEvent): Promise<void> {
    if (event.userId === null) return;
    // Nothing from before the deactivation may come back: revoke first, then re-enable.
    const revokedSessions = await this.refreshTokens.revokeAllForUser(event.companyId, event.userId);
    const enabled = await this.users.transitionStatus(event.companyId, event.userId, "disabled", "active");
    if (!enabled) return; // not disabled (e.g. never had access): leave it alone
    try {
      await this.audit.record(event.companyId, {
        actorId: event.actorId,
        action: "enable_access",
        entity: "users",
        entityId: event.userId,
        before: { status: "disabled" },
        after: { status: "active", reason: "employee_reactivated", employeeId: event.employeeId, revokedSessions },
        ip: event.ip,
      });
    } catch (error) {
      // An access change we can't audit must not stand: put the account back the way it was.
      await this.users.transitionStatus(event.companyId, event.userId, "active", "disabled");
      throw error;
    }
  }
}
