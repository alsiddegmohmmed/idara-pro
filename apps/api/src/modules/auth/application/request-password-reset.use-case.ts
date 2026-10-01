import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { NATIONAL_ID_PATTERN, normalizeLoginIdentifier } from "@idara-pro/shared";
import { RateLimiter } from "../../../shared/rate-limit/rate-limiter.service";
import { IssuePasswordResetLinkUseCase } from "./issue-password-reset-link.use-case";
import { UsersRepository } from "../infrastructure/users.repository";

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly issueLink: IssuePasswordResetLinkUseCase,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Always succeeds from the caller's view — never reveals whether the account
   * exists. Rate-limited per IP and per identifier (checked before the lookup, so
   * the limit behaves identically for real and unknown accounts). The link goes to
   * the account's email; employees identify themselves by their ID number. */
  async execute(rawIdentifier: string, ip: string): Promise<void> {
    const identifier = normalizeLoginIdentifier(rawIdentifier);
    await this.rateLimiter.assertWithinLimits([
      { key: `pwreset:id:${createHash("sha256").update(identifier).digest("hex")}`, limit: 5, windowSeconds: 3600 },
      { key: `pwreset:ip:${ip}`, limit: 20, windowSeconds: 3600 },
    ]);

    const kind = NATIONAL_ID_PATTERN.test(identifier) ? "national_id" : identifier.includes("@") ? "email" : null;
    const user = kind ? await this.users.findBySignInIdentifier(identifier, kind) : null;
    // Same silent response for unknown accounts and for accounts that can't use a link (disabled/invited).
    if (!user || user.status !== "active") {
      return;
    }

    // Sent by the worker (queue), never inside this request.
    await this.issueLink.execute(user);
  }
}
