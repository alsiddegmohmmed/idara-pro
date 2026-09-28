import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { generateOpaqueToken } from "../../../shared/auth/opaque-token";
import { hashPassword } from "../../../shared/auth/password";
import { AuditService } from "../../audit";
import { IssuePasswordResetLinkUseCase } from "./issue-password-reset-link.use-case";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";
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
 * Restoring access (event "employee.reactivated", only ever emitted for someone holding
 * employees:manage-access, never for the user themselves) re-enables a `disabled` user (never an
 * `invited` one), invalidates the old password and emails a password-set link; no old session comes back.
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
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly issueLink: IssuePasswordResetLinkUseCase,
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
    // A reset link issued earlier must not still work once the account is restored.
    await this.passwordResetTokens.invalidateAllForUser(event.companyId, event.userId);
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

  /**
   * Restores a deactivated employee's login. Returns true if it actually restored one (emitAsync collects
   * the return values, so the caller can tell "restored" from "nothing to restore").
   * Order matters: old links and sessions die and the old password is replaced BEFORE the user becomes
   * active (one atomic statement), the audit entry is written BEFORE the email is queued, and the email —
   * the one thing that can't be undone — is last. Any failure puts the account back to disabled.
   */
  @OnEvent("employee.reactivated", { suppressErrors: false })
  async onEmployeeReactivated(event: EmployeeStatusEvent): Promise<boolean> {
    if (event.userId === null) return false;
    const user = await this.users.findById(event.companyId, event.userId);
    if (!user || user.status !== "disabled") return false; // never promote an invited user; nothing to restore

    await this.passwordResetTokens.invalidateAllForUser(event.companyId, event.userId);
    const revokedSessions = await this.refreshTokens.revokeAllForUser(event.companyId, event.userId);
    // Status and password change together, only if still disabled. The random password is unguessable:
    // the old one stops working (login → 401) and nobody knows the new one until the link is used.
    const enabled = await this.users.restoreDisabled(
      event.companyId,
      event.userId,
      await hashPassword(generateOpaqueToken()),
    );
    if (!enabled) return false;
    try {
      await this.audit.record(event.companyId, {
        actorId: event.actorId,
        action: "enable_access",
        entity: "users",
        entityId: event.userId,
        before: { status: "disabled" },
        after: {
          status: "active",
          reason: "employee_reactivated",
          employeeId: event.employeeId,
          revokedSessions,
          passwordInvalidated: true,
          passwordLinkEmailed: true,
        },
        ip: event.ip,
      });
      await this.issueLink.execute(user);
    } catch (error) {
      await this.putBackToDisabled(event, error);
      throw error;
    }
    return true;
  }

  /** Compensation must never mask the original error: failures here are logged, not thrown. */
  private async putBackToDisabled(event: EmployeeStatusEvent, cause: unknown): Promise<void> {
    if (event.userId === null) return;
    try {
      await this.users.transitionStatus(event.companyId, event.userId, "active", "disabled");
      await this.passwordResetTokens.invalidateAllForUser(event.companyId, event.userId);
      await this.audit.record(event.companyId, {
        actorId: event.actorId,
        action: "disable_access",
        entity: "users",
        entityId: event.userId,
        before: { status: "active" },
        after: { status: "disabled", reason: "restore_failed", employeeId: event.employeeId, error: String(cause) },
        ip: event.ip,
      });
    } catch (compensationError) {
      this.logger.error(
        `Could not put user ${event.userId} back to disabled after a failed restore`,
        compensationError as Error,
      );
    }
  }
}
