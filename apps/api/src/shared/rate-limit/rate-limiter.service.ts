import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/redis-client";

/** Fixed-window counter in Redis. Fails closed: if Redis is down the call throws. */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Returns true if this hit is still within `limit` for the current window. */
  async hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const results = await this.redis.multi().incr(key).expire(key, windowSeconds, "NX").exec();
    // A failed EXPIRE (e.g. Redis < 7 has no NX) would leave a counter that never resets: fail closed.
    const failed = results?.find(([error]) => error);
    if (!results || failed) throw failed?.[0] ?? new Error("Rate limiter transaction failed");
    const count = Number(results[0]?.[1]);
    return count <= limit;
  }

  /** Throws HTTP 429 when any of the (key, limit) pairs is exceeded. */
  async assertWithinLimits(limits: Array<{ key: string; limit: number; windowSeconds: number }>): Promise<void> {
    // Count every dimension (no short-circuit) so a blocked IP still burns its email budget too.
    const allowed = await Promise.all(limits.map((l) => this.hit(l.key, l.limit, l.windowSeconds)));
    if (allowed.some((ok) => !ok)) {
      throw new HttpException({ error: { code: "rate_limited", message: "Too many requests" } }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
