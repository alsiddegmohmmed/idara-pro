import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

export type TenantClient = Prisma.TransactionClient;

/**
 * The ONLY sanctioned way to touch the database (docs/adr/0004-rls-deferred.md
 * point 1). Opens a transaction and sets the session variable RLS policies will
 * read once enabled, then runs `fn` with a client scoped to that transaction.
 * `fn` must still filter by companyId itself — RLS is off, this does not enforce
 * isolation on its own (see apps/api/test/tenant-isolation.e2e.test.ts).
 */
@Injectable()
export class TenantDatabase {
  constructor(private readonly prisma: PrismaService) {}

  async withTenant<T>(companyId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Escape hatch for the one legitimate pre-tenant case: resolving which
   * company an email belongs to before a session exists (login, password-reset
   * request — see UsersRepository.findByEmailAcrossCompanies). Never use this
   * for anything else; everything past that point has a companyId and must go
   * through withTenant().
   */
  async withoutTenant<T>(fn: (client: PrismaService) => Promise<T>): Promise<T> {
    return fn(this.prisma);
  }
}
