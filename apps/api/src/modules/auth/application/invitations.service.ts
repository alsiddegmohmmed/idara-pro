import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Invitation } from "@prisma/client";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { InvitationsRepository } from "../infrastructure/invitations.repository";
import { UsersRepository } from "../infrastructure/users.repository";

const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Owns invitation token mechanics only (docs/adr/0007-invitations.md) — never
 * touches the employees table. The employees module validates the
 * employee-side precondition (exists, active, not already linked) and calls
 * createForEmployee(); it's the caller's job to have already done that check.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createForEmployee(
    companyId: string,
    actorId: string,
    employeeId: string,
    email: string,
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

    // TODO(notifications module, Phase 3): send this by email instead of
    // logging it — same placeholder as RequestPasswordResetUseCase.
    this.logger.log(`Employee ${employeeId} invited at ${email}. Token (dev-only log): ${token}`);

    return invitation;
  }
}
