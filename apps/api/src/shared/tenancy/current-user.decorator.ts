import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "./authenticated-user";

/** Only valid behind JwtAuthGuard, which populates request.user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
  if (!request.user) {
    throw new Error("@CurrentUser() used on a route without JwtAuthGuard");
  }
  return request.user;
});
