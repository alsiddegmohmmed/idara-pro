import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma, type User } from "@prisma/client";
import { hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { hashPassword } from "../../../shared/auth/password";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { UsersRepository } from "../infrastructure/users.repository";
import { IssueSessionUseCase, type SessionTokens } from "./issue-session.use-case";

/** The employees module listens for this to link Employee.userId
 * (docs/adr/0007-invitations.md) — auth never touches the employees table
 * itself. The atomic `WHERE user_id IS NULL` guard against a stale second
 * acceptance lives in EmployeesRepositoryPort.linkUser() itself, not here —
 * a stale second acceptance still gets a real, working account, it just
 * won't end up as the one Employee.userId points to. See the ADR for why
 * that's an acceptable tradeoff rather than a cross-module dependency in
 * this direction. */
export interface InvitationAcceptedEvent {
  companyId: string;
  employeeId: string;
  userId: string;
}

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly issueSession: IssueSessionUseCase,
  ) {}

  async execute(token: string, password: string): Promise<SessionTokens> {
    const tokenHash = hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET);
    const invitation = await this.invitations.findValidByHashAcrossCompanies(tokenHash);
    if (!invitation) {
      throw new UnauthorizedException();
    }

    const passwordHash = await hashPassword(password);
    const user = await this.createUser(invitation.companyId, invitation.email, passwordHash);

    try {
      // emitAsync (not emit) so a failure to link the employee surfaces as a
      // real error in this response, not a silent half-state.
      await this.events.emitAsync("invitation.accepted", {
        companyId: invitation.companyId,
        employeeId: invitation.employeeId,
        userId: user.id,
      } satisfies InvitationAcceptedEvent);

      await this.invitations.markAccepted(invitation.companyId, invitation.id, this.clock.now());
    } catch (error) {
      // Compensating cleanup: without this, a transient failure here leaves
      // an orphaned User whose email collides with @@unique([companyId,
      // email]), blocking every retry with the same token forever.
      await this.users.delete(invitation.companyId, user.id).catch(() => undefined);
      throw error;
    }

    return this.issueSession.execute(user);
  }

  private async createUser(companyId: string, email: string, passwordHash: string): Promise<User> {
    try {
      return await this.users.create(companyId, { email, passwordHash, status: "active" });
    } catch (error) {
      // Two valid invitation tokens for the same email accepted at once
      // (e.g. two live "resend" tokens) race past the invite-time
      // email_in_use check — the DB's own @@unique([companyId, email])
      // constraint is the real backstop; map it to the same typed error
      // rather than leaking a raw Prisma error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BusinessRuleError("auth.invitation.email_in_use", "This email is already in use in this company");
      }
      throw error;
    }
  }
}
