import { Inject, Injectable, Logger } from "@nestjs/common";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Always succeeds from the caller's view — never reveals whether the email
   * exists (AGENTS.md-style: don't leak account existence). */
  async execute(email: string): Promise<void> {
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

    // TODO(notifications module, Phase 3): send this by email instead of logging it.
    this.logger.log(`Password reset requested for ${email}. Token (dev-only log): ${token}`);
  }
}
