import { Injectable } from "@nestjs/common";
import type { PasswordResetToken } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class PasswordResetTokensRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    return this.db.withTenant(companyId, (tx) => tx.passwordResetToken.create({ data: { companyId, ...input } }));
  }

  async findValidByHash(companyId: string, tokenHash: string): Promise<PasswordResetToken | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.passwordResetToken.findFirst({
        where: { companyId, tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      }),
    );
  }

  /** Confirm arrives with only the reset token, no session — same bootstrap
   * problem as UsersRepository.findByEmailAcrossCompanies. */
  async findValidByHashAcrossCompanies(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.db.withoutTenant((client) =>
      client.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      }),
    );
  }

  /** Atomic single use: true only for the caller that actually flipped it from unused to used. */
  async consume(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id, companyId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return count > 0;
    });
  }

  /** Voids every unused link of a user (deactivation, and before a restore issues a fresh one). */
  async invalidateAllForUser(companyId: string, userId: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.passwordResetToken.updateMany({
        where: { companyId, userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    );
  }
}
