import { Inject, Injectable } from "@nestjs/common";
import type { WorkSchedule } from "@prisma/client";
import type { CreateWorkSchedule, UpdateWorkSchedule } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { assertValidScheduleTimes, assertValidWorkDays } from "../domain/work-schedule-rules";
import {
  WORK_SCHEDULES_REPOSITORY,
  type WorkSchedulesRepositoryPort,
} from "./ports/work-schedules-repository.port";

@Injectable()
export class WorkSchedulesService {
  constructor(
    @Inject(WORK_SCHEDULES_REPOSITORY) private readonly repository: WorkSchedulesRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string): Promise<WorkSchedule[]> {
    return this.repository.list(companyId);
  }

  async findById(companyId: string, id: string): Promise<WorkSchedule> {
    const schedule = await this.repository.findById(companyId, id);
    if (!schedule) throw new NotFoundError("Work schedule not found", "company.work_schedule.not_found");
    return schedule;
  }

  async create(
    companyId: string,
    actorId: string,
    input: CreateWorkSchedule,
    ip: string | null,
  ): Promise<WorkSchedule> {
    assertValidScheduleTimes(input.startTime, input.endTime);
    assertValidWorkDays(input.workDays);

    const schedule = await this.repository.create(companyId, { ...input, createdBy: actorId });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "work_schedules",
      entityId: schedule.id,
      after: toAuditSnapshot(schedule),
      ip,
    });
    return schedule;
  }

  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateWorkSchedule,
    ip: string | null,
  ): Promise<WorkSchedule> {
    const before = await this.findById(companyId, id);
    assertValidScheduleTimes(input.startTime ?? before.startTime, input.endTime ?? before.endTime);
    assertValidWorkDays(input.workDays ?? before.workDays);

    const after = await this.repository.update(companyId, id, input);
    if (!after) throw new NotFoundError("Work schedule not found", "company.work_schedule.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "work_schedules",
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
    if (!deleted) throw new NotFoundError("Work schedule not found", "company.work_schedule.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "work_schedules",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
