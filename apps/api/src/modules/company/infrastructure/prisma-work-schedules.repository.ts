import { deleteOrInUse } from "../../../shared/database/in-use";
import { Injectable } from "@nestjs/common";
import type { WorkSchedule } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateWorkScheduleData,
  UpdateWorkScheduleData,
  WorkSchedulesRepositoryPort,
} from "../application/ports/work-schedules-repository.port";

@Injectable()
export class PrismaWorkSchedulesRepository implements WorkSchedulesRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<WorkSchedule[]> {
    return this.db.withTenant(companyId, (tx) => tx.workSchedule.findMany({ where: { companyId } }));
  }

  async findById(companyId: string, id: string): Promise<WorkSchedule | null> {
    return this.db.withTenant(companyId, (tx) => tx.workSchedule.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateWorkScheduleData): Promise<WorkSchedule> {
    return this.db.withTenant(companyId, (tx) => tx.workSchedule.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateWorkScheduleData): Promise<WorkSchedule | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.workSchedule.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.workSchedule.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await deleteOrInUse(() => tx.workSchedule.deleteMany({ where: { id, companyId } }), "company.schedule.in_use", "This schedule is still used by employees or branches");
      return count > 0;
    });
  }
}
