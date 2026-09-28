import { Injectable } from "@nestjs/common";
import type { CompanySetting } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { CompanySettingsRepositoryPort } from "../application/ports/company-settings-repository.port";

@Injectable()
export class PrismaCompanySettingsRepository implements CompanySettingsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  list(companyId: string): Promise<CompanySetting[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.companySetting.findMany({ where: { companyId }, orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }] }),
    );
  }

  findEffective(companyId: string, key: string, onDate: Date): Promise<CompanySetting | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.companySetting.findFirst({
        where: { companyId, key, effectiveFrom: { lte: onDate } },
        orderBy: { effectiveFrom: "desc" },
      }),
    );
  }

  upsert(companyId: string, data: { key: string; value: number; effectiveFrom: Date; createdBy: string }): Promise<CompanySetting> {
    return this.db.withTenant(companyId, (tx) =>
      tx.companySetting.upsert({
        where: { companyId_key_effectiveFrom: { companyId, key: data.key, effectiveFrom: data.effectiveFrom } },
        create: { companyId, ...data },
        update: { value: data.value, createdBy: data.createdBy },
      }),
    );
  }
}
