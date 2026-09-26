import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "../config/config.service";

/** JWT access token payload. Permissions are embedded at issue time (login/refresh)
 * so guards don't hit the DB per request — a revoked permission takes effect on the
 * user's next refresh, at most ACCESS_TOKEN_TTL later. */
export interface AccessTokenPayload {
  sub: string; // userId
  companyId: string;
  permissions: string[];
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
