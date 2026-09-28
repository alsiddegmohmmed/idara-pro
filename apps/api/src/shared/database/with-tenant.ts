import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

export type TenantClient = Prisma.TransactionClient;

/** The transaction a use case opened with `transaction()`; every `withTenant()` call below it joins it. */
interface AmbientTransaction {
  companyId: string;
  tx: TenantClient;
  afterCommit: Array<() => Promise<void>>;
}

/** Interactive transactions default to 5 s; a use case may hash a password and touch several tables. */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const;

/**
 * The ONLY sanctioned way to touch the database (docs/adr/0004-rls-deferred.md
 * point 1). Opens a transaction and sets the session variable RLS policies will
 * read once enabled, then runs `fn` with a client scoped to that transaction.
 * `fn` must still filter by companyId itself — RLS is off, this does not enforce
 * isolation on its own (see apps/api/test/tenant-isolation.e2e.test.ts).
 */
@Injectable()
export class TenantDatabase {
  private readonly logger = new Logger(TenantDatabase.name);
  private readonly ambient = new AsyncLocalStorage<AmbientTransaction>();

  constructor(private readonly prisma: PrismaService) {}

  async withTenant<T>(companyId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    const current = this.ambient.getStore();
    if (current) {
      // Inside transaction(): join it, so everything the use case does commits or rolls back together.
      if (current.companyId !== companyId) {
        throw new Error("Cross-tenant access inside a transaction");
      }
      return fn(current.tx);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Runs a whole use case in ONE database transaction: every repository call made (directly or through
   * event listeners) inside `fn` joins it, so a failure anywhere saves nothing. Side effects that can't be
   * rolled back (email) register with `afterCommit()` and only run once the transaction has committed.
   * Reads through `withoutTenant()` are outside the transaction and won't see its uncommitted writes.
   */
  async transaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    const current = this.ambient.getStore();
    if (current) {
      if (current.companyId !== companyId) throw new Error("Cross-tenant access inside a transaction");
      return fn(); // already in one: nested use cases just take part
    }
    const afterCommit: Array<() => Promise<void>> = [];
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return this.ambient.run({ companyId, tx, afterCommit }, fn);
    }, TRANSACTION_OPTIONS);
    for (const hook of afterCommit) {
      try {
        await hook();
      } catch (error) {
        // The data is committed; a failing side effect can't undo it. Never turn it into a request failure.
        this.logger.error(`An after-commit hook failed: ${String(error)}`, error instanceof Error ? error.stack : undefined);
      }
    }
    return result;
  }

  /** Throws unless called inside `transaction()` — for operations (row locks) that are meaningless outside one. */
  assertInTransaction(): void {
    if (!this.ambient.getStore()) {
      throw new Error("This operation must run inside TenantDatabase.transaction()");
    }
  }

  /** Runs `hook` after the surrounding `transaction()` commits (discarded if it rolls back); immediately if there is none. */
  async afterCommit(hook: () => Promise<void>): Promise<void> {
    const current = this.ambient.getStore();
    if (current) {
      current.afterCommit.push(hook);
      return;
    }
    await hook();
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
    if (this.ambient.getStore()) {
      // A second pooled connection outside the transaction: it could wait on locks the transaction holds
      // (self-deadlock until the timeout) and it holds two connections per request.
      throw new Error("withoutTenant() must not be used inside TenantDatabase.transaction()");
    }
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
