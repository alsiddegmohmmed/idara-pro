import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessTokenService } from "../auth/access-token.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";

/**
 * Every module that guards routes with JwtAuthGuard/PermissionsGuard needs
 * AccessTokenService resolvable in ITS OWN DI context — Nest resolves a guard
 * class's dependencies from the module the controller belongs to, not from
 * wherever the guard class happens to be defined. @Global() so that's true
 * everywhere without every module importing this explicitly (same pattern as
 * ConfigModule/ClockModule/DatabaseModule).
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AccessTokenService, JwtAuthGuard, PermissionsGuard],
  exports: [AccessTokenService, JwtAuthGuard, PermissionsGuard],
})
export class TenancyModule {}
