import { Injectable } from "@nestjs/common";
import type { Department } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateDepartmentData,
  DepartmentsRepositoryPort,
  UpdateDepartmentData,
} from "../application/ports/departments-repository.port";

@Injectable()
export class PrismaDepartmentsRepository implements DepartmentsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<Department[]> {
    return this.db.withTenant(companyId, (tx) => tx.department.findMany({ where: { companyId } }));
  }

  async findById(companyId: string, id: string): Promise<Department | null> {
    return this.db.withTenant(companyId, (tx) => tx.department.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateDepartmentData): Promise<Department> {
    return this.db.withTenant(companyId, (tx) => tx.department.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateDepartmentData): Promise<Department | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.department.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.department.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.department.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }
}
