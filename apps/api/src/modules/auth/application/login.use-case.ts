import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type Redis from "ioredis";
import { NATIONAL_ID_PATTERN, normalizeLoginIdentifier } from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { hashPassword, verifyPassword } from "../../../shared/auth/password";
import { REDIS_CLIENT } from "../../../shared/queue/redis-client";
import { UsersRepository } from "../infrastructure/users.repository";
import { IssueSessionUseCase, type SessionTokens } from "./issue-session.use-case";

export type { SessionTokens };

/** After this many wrong passwords for one identifier, it is locked for LOCK_SECONDS (counted from the first). */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_SECONDS = 15 * 60;
/**
 * Wrong attempts from one IP address per 15 minutes — stops guessing across many IDs. Only failures count: a whole
 * branch office behind one internet connection signs in every morning without hitting it.
 */
const MAX_FAILURES_PER_IP = 50;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in (ADR-0002, business-rules.md "Accounts"): employees use their national ID / iqama number; only accounts
 * without an employee record use an email. Defences: the same answer and similar timing for "no such account",
 * "wrong password" and "disabled account" (no account discovery); a temporary lock after repeated wrong passwords
 * per identifier and a ceiling per IP; Argon2id hashes; every success and every failure on a real account audited.
 */
@Injectable()
export class LoginUseCase {
  /** Verified against when the account doesn't exist, so the response takes as long as for a real one. */
  private readonly dummyHash: Promise<string> = hashPassword("not-a-real-password-just-for-timing");

  constructor(
    private readonly users: UsersRepository,
    private readonly issueSession: IssueSessionUseCase,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async execute(rawIdentifier: string, password: string, ip: string): Promise<SessionTokens> {
    const identifier = normalizeLoginIdentifier(rawIdentifier);
    // Keys hold a hash, never the ID number itself.
    const failKey = `login:fail:${createHash("sha256").update(identifier).digest("hex")}`;
    const ipKey = `login:ipfail:${ip}`;

    const [failures, ipFailures] = (await this.redis.mget(failKey, ipKey)).map((v) => Number(v ?? 0));
    if ((ipFailures ?? 0) >= MAX_FAILURES_PER_IP) {
      throw new HttpException({ error: { code: "rate_limited", message: "Too many requests" } }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if ((failures ?? 0) >= MAX_FAILED_ATTEMPTS) {
      const ttl = await this.redis.ttl(failKey);
      throw new HttpException(
        { error: { code: "auth.locked", message: "Too many wrong attempts — try again later", details: { retryAfterSeconds: Math.max(ttl, 60) } } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const kind = NATIONAL_ID_PATTERN.test(identifier) ? "national_id" : EMAIL.test(identifier) ? "email" : null;
    const user = kind ? await this.users.findBySignInIdentifier(identifier, kind) : null;
    // Always run one Argon2 verification, real or dummy.
    const validPassword = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);

    if (!user || !validPassword || user.status !== "active") {
      await this.redis.multi().incr(failKey).expire(failKey, LOCK_SECONDS, "NX").incr(ipKey).expire(ipKey, LOCK_SECONDS, "NX").exec();
      if (user) {
        await this.audit.record(user.companyId, {
          actorId: user.id,
          action: "login_failed",
          entity: "users",
          entityId: user.id,
          after: { reason: !validPassword ? "wrong_password" : "account_not_active" },
          ip,
        });
      }
      throw new UnauthorizedException();
    }

    await this.redis.del(failKey);
    await this.audit.record(user.companyId, { actorId: user.id, action: "login", entity: "users", entityId: user.id, ip });
    return this.issueSession.execute(user);
  }
}
