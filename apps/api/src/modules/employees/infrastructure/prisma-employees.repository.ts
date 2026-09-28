import { Injectable } from "@nestjs/common";
import type { Employee, EmployeeStatus } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateEmployeeData,
  EmployeesRepositoryPort,
  ProfileFieldsData,
  UpdateEmployeeData,
} from "../application/ports/employees-repository.port";

@Injectable()
export class PrismaEmployeesRepository implements EmployeesRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<Employee[]> {
    return this.db.withTenant(companyId, (tx) => tx.employee.findMany({ where: { companyId } }));
  }

  async findById(companyId: string, id: string): Promise<Employee | null> {
    return this.db.withTenant(companyId, (tx) => tx.employee.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateEmployeeData): Promise<Employee> {
    return this.db.withTenant(companyId, (tx) => tx.employee.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateEmployeeData): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async setStatusIf(companyId: string, id: string, expected: EmployeeStatus, next: EmployeeStatus): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({ where: { id, companyId, status: expected }, data: { status: next } });
      return count > 0;
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }

  async linkUser(companyId: string, employeeId: string, userId: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      // userId: null in the where clause is the atomic guard against a stale
      // second invitation acceptance overwriting an already-linked employee.
      const { count } = await tx.employee.updateMany({
        where: { id: employeeId, companyId, userId: null },
        data: { userId },
      });
      return count > 0;
    });
  }

  async findByUserId(companyId: string, userId: string): Promise<Employee | null> {
    return this.db.withTenant(companyId, (tx) => tx.employee.findFirst({ where: { companyId, userId } }));
  }

  async patchProfileFields(companyId: string, id: string, data: ProfileFieldsData): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async decideIban(
    companyId: string,
    id: string,
    expectedPendingIban: string,
    data: ProfileFieldsData,
  ): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({
        where: { id, companyId, ibanReviewStatus: "pending_review", pendingIban: expectedPendingIban },
        data,
      });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async listPendingIban(companyId: string): Promise<Employee[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employee.findMany({
        where: { companyId, ibanReviewStatus: "pending_review" },
        orderBy: { updatedAt: "asc" },
      }),
    );
  }
}
