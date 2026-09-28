import { Injectable } from "@nestjs/common";
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

  /** Always succeeds from the caller's view — never reveals whether the email
   * exists. Rate-limited per IP and per email (checked before the lookup, so the
   * limit behaves identically for real and unknown addresses). */
  async execute(email: string, ip: string): Promise<void> {
    await this.rateLimiter.assertWithinLimits([
      { key: `pwreset:email:${email.trim().toLowerCase()}`, limit: 5, windowSeconds: 3600 },
      { key: `pwreset:ip:${ip}`, limit: 20, windowSeconds: 3600 },
    ]);

    const user = await this.users.findByEmailAcrossCompanies(email);
    // Same silent response for unknown emails and for accounts that can't use a link (disabled/invited).
    if (!user || user.status !== "active") {
      return;
    }

    // Sent by the worker (queue), never inside this request.
    await this.issueLink.execute(user);
  }
}
