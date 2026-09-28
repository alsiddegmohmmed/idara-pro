import { Inject, Injectable } from "@nestjs/common";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { EmailQueueService } from "../../../shared/mail/email-queue.service";
import { renderPasswordResetEmail } from "../../../shared/mail/templates/password-reset-email";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — the email says so

/** Creates a one-time password link and queues the (bilingual) email; the worker sends it.
 * Used by forgot-password and by access restoration, so both send the same email. */
@Injectable()
export class IssuePasswordResetLinkUseCase {
  constructor(
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly emailQueue: EmailQueueService,
  ) {}

  async execute(user: { id: string; companyId: string; email: string }): Promise<void> {
    const token = generateOpaqueToken();
    await this.passwordResetTokens.create(user.companyId, {
      userId: user.id,
      tokenHash: hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET),
      expiresAt: new Date(this.clock.now().getTime() + RESET_TOKEN_TTL_MS),
    });
    const resetUrl = `${this.config.env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.emailQueue.enqueue({ to: user.email, ...renderPasswordResetEmail({ resetUrl }) });
  }
}
