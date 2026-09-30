import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "../config/config.service";

/** JWT access token payload: who the caller is, nothing about what they may do. Permissions come from the
 * access snapshot on every request (ADR-0011 §4), so a revocation never waits for the token to expire. */
export interface AccessTokenPayload {
  sub: string; // userId
  companyId: string;
}

export const ACCESS_TOKEN_TTL = "15m"; // ADR-0002

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  sign(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  verify(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.env.JWT_ACCESS_SECRET,
    });
  }
}
