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

  async markUsed(companyId: string, id: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.passwordResetToken.updateMany({ where: { id, companyId }, data: { usedAt: new Date() } }),
    );
  }
}
