import { Inject, Injectable } from "@nestjs/common";
import type { Invitation } from "@prisma/client";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { EmailQueueService } from "../../../shared/mail/email-queue.service";
import { renderInvitationEmail } from "../../../shared/mail/templates/invitation-email";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { UsersRepository } from "../infrastructure/users.repository";

// docs/domain/business-rules.md "Employee onboarding": one-time link, 72 hours.
const INVITATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Owns invitation token mechanics only (docs/adr/0007-invitations.md) — never
 * touches the employees table. The employees module validates the
 * employee-side precondition (exists, active, not already linked) and calls
 * createForEmployee(); it's the caller's job to have already done that check.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly emailQueue: EmailQueueService,
  ) {}

  async createForEmployee(
    companyId: string,
    actorId: string,
    employeeId: string,
    email: string,
    employeeName: string,
  ): Promise<Invitation> {
    const existingUser = await this.users.findByEmail(companyId, email);
    if (existingUser) {
      throw new BusinessRuleError("auth.invitation.email_in_use", "This email is already in use in this company");
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(this.clock.now().getTime() + INVITATION_TOKEN_TTL_MS);
    const invitation = await this.invitations.create(companyId, {
      employeeId,
      email,
      tokenHash: hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET),
      expiresAt,
      createdBy: actorId,
    });

    // Sent by the worker (queue), never inside this request.
    const acceptUrl = `${this.config.env.WEB_APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`;
    await this.emailQueue.enqueue({ to: email, ...renderInvitationEmail({ acceptUrl, employeeName }) });

    return invitation;
  }
}
