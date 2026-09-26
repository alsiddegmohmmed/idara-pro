import { Inject, Injectable } from "@nestjs/common";
import type { Holiday } from "@prisma/client";
import type { CreateHoliday, UpdateHoliday } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { HOLIDAYS_REPOSITORY, type HolidaysRepositoryPort } from "./ports/holidays-repository.port";

@Injectable()
export class HolidaysService {
  constructor(
    @Inject(HOLIDAYS_REPOSITORY) private readonly repository: HolidaysRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string): Promise<Holiday[]> {
    return this.repository.list(companyId);
  }

  async findById(companyId: string, id: string): Promise<Holiday> {
    const holiday = await this.repository.findById(companyId, id);
    if (!holiday) throw new NotFoundError("Holiday not found", "company.holiday.not_found");
    return holiday;
  }

  async create(companyId: string, actorId: string, input: CreateHoliday, ip: string | null): Promise<Holiday> {
    const holiday = await this.repository.create(companyId, {
      name: input.name,
      paid: input.paid,
      date: new Date(input.date),
      createdBy: actorId,
    });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "holidays",
      entityId: holiday.id,
      after: toAuditSnapshot(holiday),
      ip,
    });
    return holiday;
  }

  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateHoliday,
    ip: string | null,
  ): Promise<Holiday> {
    const before = await this.findById(companyId, id);
    const after = await this.repository.update(companyId, id, {
      name: input.name,
      paid: input.paid,
      date: input.date ? new Date(input.date) : undefined,
    });
    if (!after) throw new NotFoundError("Holiday not found", "company.holiday.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "holidays",
      entityId: id,
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(after),
      ip,
    });
    return after;
  }

  async remove(companyId: string, actorId: string, id: string, ip: string | null): Promise<void> {
    const before = await this.findById(companyId, id);
    const deleted = await this.repository.delete(companyId, id);
    if (!deleted) throw new NotFoundError("Holiday not found", "company.holiday.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "holidays",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
