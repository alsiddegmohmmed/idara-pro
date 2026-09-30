import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma, type User } from "@prisma/client";
import { EMPLOYEE_ROLE_ID } from "../../../shared/access/system-roles";
import { hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { hashPassword } from "../../../shared/auth/password";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { UsersRepository } from "../infrastructure/users.repository";
import { IssueSessionUseCase, type SessionTokens } from "./issue-session.use-case";

/** The employees module listens for this to link Employee.userId
 * (docs/adr/0007-invitations.md) — auth never touches the employees table
 * itself. The listener runs inside the accept transaction, locks the
 * employee row and refuses (rolling the whole acceptance back) when the
 * employee is inactive or already linked — docs/adr/0008. */
export interface InvitationAcceptedEvent {
  companyId: string;
  employeeId: string;
  userId: string;
}

@Injectable()
export class AcceptInvitationUseCase {
  private readonly logger = new Logger(AcceptInvitationUseCase.name);

  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly issueSession: IssueSessionUseCase,
    private readonly db: TenantDatabase,
  ) {}

  async execute(token: string, password: string): Promise<SessionTokens> {
    const tokenHash = hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET);
    const invitation = await this.invitations.findValidByHashAcrossCompanies(tokenHash);
    if (!invitation) {
      throw new UnauthorizedException();
    }

    const passwordHash = await hashPassword(password);
    // One transaction: the account, its role, the employee link (which locks the employee row and refuses
    // an inactive or already-linked employee — see LinkEmployeeUserListener) and the consumed invitation
    // commit together (with the first session). Any failure — including that refusal — leaves nothing behind, so no orphan user
    // and no burned invitation.
    const { session } = await this.db.transaction(invitation.companyId, async () => {
      const created = await this.createUser(invitation.companyId, invitation.email, passwordHash);

      // Baseline permissions (employees:self-service, notifications:read) — without a role a
      // new hire's account can do nothing at all (docs/adr/0008). Required.
      const assigned = await this.users.assignRole(invitation.companyId, created.id, EMPLOYEE_ROLE_ID);
      if (!assigned) {
        this.logger.error(`Employee role ${EMPLOYEE_ROLE_ID} is missing — run \`prisma migrate deploy\``);
        throw new Error("Employee role is not provisioned");
      }

      // emitAsync + a listener with suppressErrors:false, so a refusal surfaces as this request's error.
      await this.events.emitAsync("invitation.accepted", {
        companyId: invitation.companyId,
        employeeId: invitation.employeeId,
        userId: created.id,
      } satisfies InvitationAcceptedEvent);

      if (!(await this.invitations.markAccepted(invitation.companyId, invitation.id, this.clock.now()))) {
        throw new UnauthorizedException(); // used or expired since the lookup
      }
      // The session is issued inside the transaction too: if it fails nothing is committed and the
      // invitation stays usable, instead of leaving a linked account whose token now reads as "used".
      const session = await this.issueSession.execute(created);
      return { user: created, session };
    });

    return session;
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
