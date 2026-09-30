import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AccessPolicy } from "../access/access-policy.service";
import { AccessTokenService } from "../auth/access-token.service";
import type { AuthenticatedUser } from "./authenticated-user";

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/** Apply per-controller/route (`@UseGuards(JwtAuthGuard)`), not globally — login/refresh/password-reset are
 * intentionally unauthenticated. The token only proves who the caller is; what they may do comes from the
 * access snapshot, so a revoked role or a disabled user stops working on the next request (ADR-0011 §4). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly policy: AccessPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    let payload: { sub: string; companyId: string };
    try {
      payload = this.accessTokens.verify(header.slice("Bearer ".length));
    } catch {
      throw new UnauthorizedException();
    }
    const access = await this.policy.snapshot(payload.companyId, payload.sub);
    if (!access) throw new UnauthorizedException();
    request.user = { userId: payload.sub, companyId: payload.companyId, permissions: Object.keys(access.grants), access };
    return true;
  }
}
