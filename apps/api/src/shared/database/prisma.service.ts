import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "../config/config.service";

/**
 * Connects as the least-privilege `idara_app` role (docs/adr/0004-rls-deferred.md
 * point 3), not the role migrations run as. Never inject this directly in a module
 * — go through `withTenant()` (./with-tenant.ts) so every query is tenant-scoped.
 *
 * No eager $connect(): Prisma connects lazily on first query. That keeps modules
 * that never touch the DB (e.g. health) bootstrap-able without a live Postgres —
 * see test/health.e2e.test.ts.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ datasources: { db: { url: config.env.APP_DATABASE_URL } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
