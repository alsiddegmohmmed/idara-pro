import { Inject, Injectable } from "@nestjs/common";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { EmailQueueService } from "../../../shared/mail/email-queue.service";
import { renderPasswordResetEmail } from "../../../shared/mail/templates/password-reset-email";
import { RateLimiter } from "../../../shared/rate-limit/rate-limiter.service";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly emailQueue: EmailQueueService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Always succeeds from the caller's view — never reveals whether the email
   * exists. Rate-limited per IP and per email (checked before the lookup, so the
   * limit behaves identically for real and unknown addresses). */
  async execute(email: string, ip: string): Promise<void> {
    await this.rateLimiter.assertWithinLimits([
      { key: `pwreset:email:${email.trim().toLowerCase()}`, limit: 5, windowSeconds: 3600 },
      { key: `pwreset:ip:${ip}`, limit: 20, windowSeconds: 3600 },
    ]);

    const user = await this.users.findByEmailAcrossCompanies(email);
    if (!user) {
      return;
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(this.clock.now().getTime() + RESET_TOKEN_TTL_MS);
    await this.passwordResetTokens.create(user.companyId, {
      userId: user.id,
      tokenHash: hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET),
      expiresAt,
    });

    // Sent by the worker (queue), never inside this request.
    const resetUrl = `${this.config.env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.emailQueue.enqueue({ to: user.email, ...renderPasswordResetEmail({ resetUrl }) });
  }
}
