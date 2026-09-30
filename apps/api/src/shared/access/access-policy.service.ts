import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { CLOCK, type Clock } from "../clock/clock";
import { companyDateOnly } from "../clock/company-date";
import { TenantDatabase } from "../database/with-tenant";
import { REDIS_CLIENT } from "../queue/redis-client";
import { scopeCovers, scopeFor, type AccessSnapshot, type DataScope, type ScopeTarget } from "./access-rules";
import { AccessSnapshotLoader } from "./access-snapshot.loader";

/** Backstop only: every change that affects access bumps the company version, which retires old snapshots at once. */
const SNAPSHOT_TTL_SECONDS = 300;

/**
 * The one place that answers "what may this user reach" (ADR-0011 §2, §4). Snapshots are cached in Redis
 * under a per-company version: `invalidateCompany()` bumps it, so a role change, an assignment change or an
 * employee's branch/manager/status change applies on the very next request. At hundreds of users a
 * company-wide bump is cheaper and safer than tracking whose team or branch a change touched.
 * If Redis is down it falls back to the database (slower, never wrong).
 */
@Injectable()
export class AccessPolicy {
  private readonly logger = new Logger(AccessPolicy.name);

  constructor(
    private readonly loader: AccessSnapshotLoader,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly db: TenantDatabase,
  ) {}

  /** Null = the user can't act (missing, disabled, not activated): the guard answers 401. */
  async snapshot(companyId: string, userId: string): Promise<AccessSnapshot | null> {
    // Inside a transaction the loader may read uncommitted access changes: never cache those.
    const key = this.db.isInTransaction() ? null : await this.cacheKey(companyId, userId);
    if (key) {
      try {
        const cached = await this.redis.get(key);
        if (cached) return JSON.parse(cached) as AccessSnapshot | null;
      } catch (error) {
        this.logger.warn(`Access cache read failed, using the database: ${String(error)}`);
      }
    }
    const snapshot = await this.loader.load(companyId, userId, companyDateOnly(this.clock.now()));
    if (key) {
      try {
        await this.redis.set(key, JSON.stringify(snapshot), "EX", SNAPSHOT_TTL_SECONDS);
      } catch (error) {
        this.logger.warn(`Access cache write failed: ${String(error)}`);
      }
    }
    return snapshot;
  }

  scopeFor(snapshot: AccessSnapshot, code: string): DataScope | null {
    return scopeFor(snapshot, code);
  }

  covers(snapshot: AccessSnapshot, code: string, target: ScopeTarget): boolean {
    return scopeCovers(scopeFor(snapshot, code), target);
  }

  /**
   * Every active user who may act on `target` with `code` (ADR-0011 §6.3: one responsibility, many people).
   * Approvals and their notifications go to all of them; the first decision wins.
   */
  async usersWhoCan(companyId: string, code: string, target: ScopeTarget): Promise<string[]> {
    const candidates = await this.loader.userIdsHolding(companyId, code);
    const result: string[] = [];
    for (const userId of candidates) {
      const snapshot = await this.snapshot(companyId, userId);
      if (snapshot && scopeCovers(scopeFor(snapshot, code), target)) result.push(userId);
    }
    return result;
  }

  /**
   * Call after committing anything that changes access: roles, role permissions, assignments, an employee's
   * branch/manager/status/login link, a user's status. Never throws — a failed bump is logged and the
   * snapshot TTL is the backstop.
   */
  async invalidateCompany(companyId: string): Promise<void> {
    try {
      await this.redis.incr(this.versionKey(companyId));
    } catch (error) {
      this.logger.error(`Could not invalidate access snapshots of company ${companyId}: ${String(error)}`);
    }
  }

  private versionKey(companyId: string): string {
    return `access:version:${companyId}`;
  }

  /** Null when Redis is unreachable: skip the cache entirely rather than risk reading a stale version. */
  private async cacheKey(companyId: string, userId: string): Promise<string | null> {
    try {
      const version = (await this.redis.get(this.versionKey(companyId))) ?? "0";
      return `access:snapshot:${companyId}:${version}:${userId}`;
    } catch (error) {
      this.logger.warn(`Access cache unavailable, using the database: ${String(error)}`);
      return null;
    }
  }
}
