import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AccessTokenService } from "../../../shared/auth/access-token.service";
import { generateOpaqueToken, hashOpaqueToken } from "../../../shared/auth/opaque-token";
import { verifyPassword } from "../../../shared/auth/password";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { ConfigService } from "../../../shared/config/config.service";
import { RefreshTokensRepository } from "../infrastructure/refresh-tokens.repository";
import { UsersRepository } from "../infrastructure/users.repository";

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(email: string, password: string): Promise<SessionTokens> {
    // Same error for "no such user" and "wrong password" — don't reveal which.
    const user = await this.users.findByEmailAcrossCompanies(email);
    if (!user || user.status !== "active") {
      throw new UnauthorizedException();
    }

    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) {
      throw new UnauthorizedException();
    }

    const permissions = await this.users.findPermissionCodes(user.companyId, user.id);
    const accessToken = this.accessTokens.sign({ sub: user.id, companyId: user.companyId, permissions });

    const now = this.clock.now();
    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    await this.refreshTokens.create(user.companyId, {
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: hashOpaqueToken(refreshToken, this.config.env.JWT_REFRESH_SECRET),
      expiresAt: refreshTokenExpiresAt,
    });

    await this.users.updateLastLogin(user.companyId, user.id, now);

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }
}
