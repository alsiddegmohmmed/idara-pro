import { Injectable } from "@nestjs/common";
import type { RefreshToken } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreateRefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return this.db.withTenant(companyId, (tx) => tx.refreshToken.create({ data: { companyId, ...input } }));
  }

  async findByHash(companyId: string, tokenHash: string): Promise<RefreshToken | null> {
    return this.db.withTenant(companyId, (tx) => tx.refreshToken.findFirst({ where: { companyId, tokenHash } }));
  }

  /** Refresh requests arrive with an expired access token (or none) — same
   * bootstrap problem as UsersRepository.findByEmailAcrossCompanies. Resolves
   * companyId from the presented token; every operation after that is tenant-scoped. */
  async findByHashAcrossCompanies(tokenHash: string): Promise<RefreshToken | null> {
    return this.db.withoutTenant((client) => client.refreshToken.findFirst({ where: { tokenHash } }));
  }

  async revoke(companyId: string, id: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.refreshToken.updateMany({ where: { id, companyId }, data: { revokedAt: new Date() } }),
    );
  }

  /** Ends every session of a user (deactivation). Returns how many tokens were still live. */
  async revokeAllForUser(companyId: string, userId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { companyId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return count;
    });
  }

  /** Reuse detection: a revoked/expired token presented again means the whole
   * session family may be compromised (docs/architecture/overview.md). */
  async revokeFamily(companyId: string, familyId: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.refreshToken.updateMany({
        where: { companyId, familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }
}
