import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CLOCK, type Clock } from "../clock/clock";
import { TenantDatabase } from "../database/with-tenant";
import { BusinessRuleError } from "../errors/errors";

const TTL_MS = 24 * 60 * 60 * 1000;

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

/**
 * `Idempotency-Key` (docs/architecture/overview.md): the first successful response for a
 * (user, scope, key) is stored in the same transaction as the work, and a retry gets that response
 * back instead of doing the work twice. A key reused with a different body is refused. Failures are
 * not stored — a retry after an error runs again.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run<T>(
    companyId: string,
    userId: string,
    scope: string,
    key: string,
    requestHash: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const replay = await this.find(companyId, userId, scope, key, requestHash);
    if (replay !== undefined) return replay as T;
    try {
      return await this.db.transaction(companyId, async () => {
        const result = await work();
        await this.db.withTenant(companyId, (tx) =>
          tx.idempotencyKey.create({
            data: {
              companyId,
              userId,
              scope,
              key,
              requestHash,
              response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
              expiresAt: new Date(this.clock.now().getTime() + TTL_MS),
            },
          }),
        );
        return result;
      });
    } catch (error) {
      // A concurrent request with the same key committed first: ours rolled back — return theirs.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.find(companyId, userId, scope, key, requestHash);
        if (winner !== undefined) return winner as T;
      }
      throw error;
    }
  }

  private async find(companyId: string, userId: string, scope: string, key: string, requestHash: string): Promise<unknown> {
    const row = await this.db.withTenant(companyId, (tx) =>
      tx.idempotencyKey.findUnique({ where: { companyId_userId_scope_key: { companyId, userId, scope, key } } }),
    );
    if (!row || row.expiresAt.getTime() < this.clock.now().getTime()) return undefined;
    if (row.requestHash !== requestHash) {
      throw new BusinessRuleError("idempotency.key_reused", "This Idempotency-Key was already used for a different request");
    }
    return row.response;
  }
}
