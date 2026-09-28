import { Inject, Injectable } from "@nestjs/common";
import type { CompanySetting } from "@prisma/client";
import { COMPANY_SETTING_KEYS, type UpsertCompanySetting } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { COMPANY_SETTINGS_REPOSITORY, type CompanySettingsRepositoryPort } from "./ports/company-settings-repository.port";

const KNOWN_KEYS = new Set<string>(Object.values(COMPANY_SETTING_KEYS));

/**
 * Dated company policies (docs/domain/business-rules.md: TBD rules become settings with a safe
 * default). Callers pass the documented default; a stored row only overrides it from its date on.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    @Inject(COMPANY_SETTINGS_REPOSITORY) private readonly repository: CompanySettingsRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string): Promise<CompanySetting[]> {
    return this.repository.list(companyId);
  }

  async getNumber(companyId: string, key: string, onDate: Date, fallback: number): Promise<number> {
    const row = await this.repository.findEffective(companyId, key, onDate);
    return typeof row?.value === "number" ? row.value : fallback;
  }

  async upsert(companyId: string, actorId: string, key: string, input: UpsertCompanySetting, ip: string | null): Promise<CompanySetting> {
    if (!KNOWN_KEYS.has(key)) throw new NotFoundError("Unknown setting", "company.setting.unknown_key");
    const row = await this.repository.upsert(companyId, {
      key,
      value: input.value,
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
      createdBy: actorId,
    });
    await this.audit.record(companyId, {
      actorId,
      action: "upsert",
      entity: "company_settings",
      entityId: row.id,
      after: toAuditSnapshot(row),
      ip,
    });
    return row;
  }
}
