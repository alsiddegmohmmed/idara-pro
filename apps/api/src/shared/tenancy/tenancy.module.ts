import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessPolicy } from "../access/access-policy.service";
import { AccessSnapshotLoader } from "../access/access-snapshot.loader";
import { AccessTokenService } from "../auth/access-token.service";
import { QueueModule } from "../queue/queue.module";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";

/**
 * Every module that guards routes with JwtAuthGuard/PermissionsGuard needs AccessTokenService and
 * AccessPolicy resolvable in ITS OWN DI context — Nest resolves a guard class's dependencies from the module
 * the controller belongs to, not from wherever the guard class happens to be defined. @Global() so that's
 * true everywhere without every module importing this explicitly (same pattern as ConfigModule/ClockModule/
 * DatabaseModule). AccessPolicy lives here too: every module that scopes data (ADR-0011 §2) injects it.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), QueueModule],
  providers: [AccessTokenService, AccessSnapshotLoader, AccessPolicy, JwtAuthGuard, PermissionsGuard],
  exports: [AccessTokenService, AccessPolicy, JwtAuthGuard, PermissionsGuard],
})
export class TenancyModule {}
