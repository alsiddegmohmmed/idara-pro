import { Injectable, UnauthorizedException } from "@nestjs/common";
import { hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { hashPassword } from "../../../shared/auth/password";
import { ConfigService } from "../../../shared/config/config.service";
import { PasswordResetTokensRepository } from "../infrastructure/password-reset-tokens.repository";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token, this.config.env.JWT_REFRESH_SECRET);
    const resetToken = await this.passwordResetTokens.findValidByHashAcrossCompanies(tokenHash);
    if (!resetToken) {
      throw new UnauthorizedException();
    }
    // Single use, decided atomically: of two concurrent confirms only one gets past this line.
    if (!(await this.passwordResetTokens.consume(resetToken.companyId, resetToken.id))) {
      throw new UnauthorizedException();
    }
    // A disabled account (deactivated employee) can't have a password set through a link.
    const user = await this.users.findById(resetToken.companyId, resetToken.userId);
    if (!user || user.status !== "active") {
      throw new UnauthorizedException();
    }

    const passwordHash = await hashPassword(newPassword);
    await this.users.updatePasswordHash(resetToken.companyId, resetToken.userId, passwordHash);
    // A new password ends every existing session (whoever held the old password is signed out).
    await this.refreshTokens.revokeAllForUser(resetToken.companyId, resetToken.userId);
  }
}
