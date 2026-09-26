import { Injectable, UnauthorizedException } from "@nestjs/common";
import { hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { hashPassword } from "../../../shared/auth/password";
import { ConfigService } from "../../../shared/config/config.service";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET);
    const resetToken = await this.passwordResetTokens.findValidByHashAcrossCompanies(tokenHash);
    if (!resetToken) {
      throw new UnauthorizedException();
    }

    const passwordHash = await hashPassword(newPassword);
    await this.users.updatePasswordHash(resetToken.companyId, resetToken.userId, passwordHash);
    await this.passwordResetTokens.markUsed(resetToken.companyId, resetToken.id);
  }
}
