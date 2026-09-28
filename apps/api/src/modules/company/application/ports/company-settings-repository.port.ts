import type { CompanySetting } from "@prisma/client";

export const COMPANY_SETTINGS_REPOSITORY = Symbol("COMPANY_SETTINGS_REPOSITORY");

export interface CompanySettingsRepositoryPort {
  list(companyId: string): Promise<CompanySetting[]>;
  /** The row in force on `onDate`: latest effective_from <= onDate. */
  findEffective(companyId: string, key: string, onDate: Date): Promise<CompanySetting | null>;
  upsert(companyId: string, data: { key: string; value: number; effectiveFrom: Date; createdBy: string }): Promise<CompanySetting>;
}
