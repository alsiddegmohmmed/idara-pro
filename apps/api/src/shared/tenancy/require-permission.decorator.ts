import { SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "@idara-pro/shared";

export const PERMISSION_KEY = "requiredPermission";

/** AGENTS.md §3 rule 2: every endpoint declares this — hiding UI is not
 * security. Pair with @UseGuards(JwtAuthGuard, PermissionsGuard). */
export const RequirePermission = (permission: PermissionCode): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
