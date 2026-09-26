import { Injectable } from "@nestjs/common";
import type { Holiday } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateHolidayData,
  HolidaysRepositoryPort,
  UpdateHolidayData,
} from "../application/ports/holidays-repository.port";

@Injectable()
export class PrismaHolidaysRepository implements HolidaysRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<Holiday[]> {
    return this.db.withTenant(companyId, (tx) => tx.holiday.findMany({ where: { companyId }, orderBy: { date: "asc" } }));
  }

  async findById(companyId: string, id: string): Promise<Holiday | null> {
    return this.db.withTenant(companyId, (tx) => tx.holiday.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateHolidayData): Promise<Holiday> {
    return this.db.withTenant(companyId, (tx) => tx.holiday.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateHolidayData): Promise<Holiday | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.holiday.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.holiday.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.holiday.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }
}
