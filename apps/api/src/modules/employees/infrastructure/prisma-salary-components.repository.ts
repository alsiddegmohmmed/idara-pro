import { Injectable } from "@nestjs/common";
import type { SalaryComponent, SalaryComponentType } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateSalaryComponentData,
  SalaryComponentsRepositoryPort,
  UpdateSalaryComponentData,
} from "../application/ports/salary-components-repository.port";

@Injectable()
export class PrismaSalaryComponentsRepository implements SalaryComponentsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async listByEmployee(companyId: string, employeeId: string): Promise<SalaryComponent[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.salaryComponent.findMany({ where: { companyId, employeeId } }),
    );
  }

  async listByEmployeeAndType(
    companyId: string,
    employeeId: string,
    type: SalaryComponentType,
  ): Promise<SalaryComponent[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.salaryComponent.findMany({ where: { companyId, employeeId, type } }),
    );
  }

  async findById(companyId: string, id: string): Promise<SalaryComponent | null> {
    return this.db.withTenant(companyId, (tx) => tx.salaryComponent.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateSalaryComponentData): Promise<SalaryComponent> {
    return this.db.withTenant(companyId, (tx) => tx.salaryComponent.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateSalaryComponentData): Promise<SalaryComponent | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.salaryComponent.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.salaryComponent.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.salaryComponent.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }
}
