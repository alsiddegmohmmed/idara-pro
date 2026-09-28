import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AccessTokenService } from "../../../shared/auth/access-token.service";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";
import { REFRESH_TOKEN_TTL_MS, type SessionTokens } from "./issue-session.use-case";

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(presentedToken: string): Promise<SessionTokens> {
    const tokenHash = hashOpaqueToken(presentedToken, this.config.env.JWT_REFRESH_SECRET);
    const existing = await this.refreshTokens.findByHashAcrossCompanies(tokenHash);
    if (!existing) {
      throw new UnauthorizedException();
    }

    const now = this.clock.now();
    if (existing.revokedAt || existing.expiresAt < now) {
      // Reuse of a revoked/expired token: the family may be compromised.
      // docs/architecture/overview.md — revoke the whole family, not just this token.
      await this.refreshTokens.revokeFamily(existing.companyId, existing.familyId);
      throw new UnauthorizedException();
    }

    // A disabled user (e.g. a deactivated employee) can't mint new access tokens. Checked before
    // rotating so a deactivation racing with a refresh can't leave a fresh live token behind.
    const user = await this.users.findById(existing.companyId, existing.userId);
    if (!user || user.status !== "active") {
      await this.refreshTokens.revokeFamily(existing.companyId, existing.familyId);
      throw new UnauthorizedException();
    }

    await this.refreshTokens.revoke(existing.companyId, existing.id);

    const permissions = await this.users.findPermissionCodes(existing.companyId, existing.userId);
    const accessToken = this.accessTokens.sign({
      sub: existing.userId,
      companyId: existing.companyId,
      permissions,
    });

    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    await this.refreshTokens.create(existing.companyId, {
      userId: existing.userId,
      familyId: existing.familyId,
      tokenHash: hashOpaqueToken(refreshToken, this.config.env.JWT_REFRESH_SECRET),
      expiresAt: refreshTokenExpiresAt,
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }
}
