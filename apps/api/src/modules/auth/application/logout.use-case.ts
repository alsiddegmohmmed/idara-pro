import { Injectable } from "@nestjs/common";
import { hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { ConfigService } from "../../../shared/config/config.service";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(presentedToken: string): Promise<void> {
    const tokenHash = hashOpaqueToken(presentedToken, this.config.env.JWT_REFRESH_SECRET);
    const existing = await this.refreshTokens.findByHashAcrossCompanies(tokenHash);
    if (!existing) {
      return; // Already gone — logout is idempotent.
    }
    await this.refreshTokens.revokeFamily(existing.companyId, existing.familyId);
  }
}
