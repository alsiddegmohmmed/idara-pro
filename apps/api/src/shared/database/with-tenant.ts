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
   * Escape hatch for the two narrow shapes of legitimately cross-tenant work:
   *   - A pre-session lookup by a bearer credential (email, password-reset
   *     token, invitation token, refresh token) where the caller doesn't have
   *     a companyId yet — resolving it IS the point of the lookup. Examples:
   *     UsersRepository.findByEmailAcrossCompanies, PasswordResetTokensRepository
   *     .findValidByHashAcrossCompanies, InvitationsRepository.findValidByHashAcrossCompanies.
   *   - A whole-system batch/scheduled job that must enumerate companies
   *     rather than act within one (see listCompanyIds() below) — legitimate
   *     because Company IS the tenant boundary, not sub-tenant data.
   * Never use this for anything else — everything past a real session, or
   * past resolving one of the above, has a companyId and must go through
   * withTenant(). New call sites matching either shape are expected as more
   * modules are built; keep this comment describing the pattern, not an
   * exhaustive list of every caller (which will drift as more get added).
   */
  async withoutTenant<T>(fn: (client: PrismaService) => Promise<T>): Promise<T> {
    return fn(this.prisma);
  }

  /**
   * Cross-tenant by nature (see withoutTenant() above) — lists every company
   * id so a scheduled job can process one company at a time via withTenant().
   * Never for anything request-scoped.
   */
  async listCompanyIds(): Promise<string[]> {
    return this.withoutTenant(async (client) => {
      const companies = await client.company.findMany({ select: { id: true } });
      return companies.map((company) => company.id);
    });
  }
}
