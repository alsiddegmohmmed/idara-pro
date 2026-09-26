import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AccessTokenService } from "../auth/access-token.service";
import type { AuthenticatedUser } from "./authenticated-user";

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/** Apply per-controller/route (`@UseGuards(JwtAuthGuard)`), not globally —
 * login/refresh/password-reset are intentionally unauthenticated. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokens: AccessTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    try {
      const payload = this.accessTokens.verify(header.slice("Bearer ".length));
      request.user = { userId: payload.sub, companyId: payload.companyId, permissions: payload.permissions };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
