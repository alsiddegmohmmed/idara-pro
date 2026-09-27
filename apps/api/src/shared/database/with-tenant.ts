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
   * Escape hatch for the narrow, documented cross-tenant cases:
   *   1. Resolving which company an email belongs to before a session exists
   *      (login, password-reset request — see UsersRepository.findByEmailAcrossCompanies).
   *   2. Listing company ids for a scheduled/batch job that must run once per
   *      company (see listCompanyIds() below) — legitimate because Company
   *      IS the tenant boundary, not sub-tenant data; listing it isn't a
   *      cross-tenant data leak the way listing another company's employees
   *      would be.
   * Never use this for anything else — everything past either of those two
   * points has a companyId and must go through withTenant().
   */
  async withoutTenant<T>(fn: (client: PrismaService) => Promise<T>): Promise<T> {
    return fn(this.prisma);
  }

  /**
   * Cross-tenant by nature (see withoutTenant() case 2 above) — lists every
   * company id so a scheduled job can process one company at a time via
   * withTenant(). Never for anything request-scoped.
   */
  async listCompanyIds(): Promise<string[]> {
    return this.withoutTenant(async (client) => {
      const companies = await client.company.findMany({ select: { id: true } });
      return companies.map((company) => company.id);
    });
  }
}
