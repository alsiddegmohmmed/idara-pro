import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionCode } from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "./authenticated-user";
import { PERMISSION_KEY } from "./require-permission.decorator";

/** Runs after JwtAuthGuard — reads the permission @RequirePermission set and
 * checks it against request.user.permissions (embedded in the access token). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    if (!request.user?.permissions.includes(required)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
