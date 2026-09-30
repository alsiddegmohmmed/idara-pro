import { Injectable } from "@nestjs/common";
import type { EmployeeAssignment } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { AssignmentValues } from "../domain/assignment-rules";
import type { AssignmentsRepositoryPort, CreateAssignmentData } from "../application/ports/assignments-repository.port";

@Injectable()
export class PrismaAssignmentsRepository implements AssignmentsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  findCurrent(companyId: string, employeeId: string): Promise<EmployeeAssignment | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeAssignment.findFirst({ where: { companyId, employeeId, appliedAt: { not: null }, validTo: null } }),
    );
  }

  findScheduled(companyId: string, employeeId: string): Promise<EmployeeAssignment | null> {
    return this.db.withTenant(companyId, (tx) => tx.employeeAssignment.findFirst({ where: { companyId, employeeId, appliedAt: null } }));
  }

  listByEmployee(companyId: string, employeeId: string): Promise<EmployeeAssignment[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeAssignment.findMany({ where: { companyId, employeeId }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] }),
    );
  }

  create(companyId: string, data: CreateAssignmentData): Promise<EmployeeAssignment> {
    return this.db.withTenant(companyId, (tx) => tx.employeeAssignment.create({ data: { companyId, ...data } }));
  }

  async close(companyId: string, id: string, validTo: Date): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employeeAssignment.updateMany({ where: { id, companyId }, data: { validTo } }));
  }

  async replace(
    companyId: string,
    id: string,
    data: AssignmentValues & { kind: CreateAssignmentData["kind"]; reason: string | null },
  ): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employeeAssignment.updateMany({ where: { id, companyId }, data }));
  }

  async markApplied(companyId: string, id: string, at: Date): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employeeAssignment.updateMany({ where: { id, companyId }, data: { appliedAt: at } }));
  }

  deleteScheduled(companyId: string, employeeId: string): Promise<EmployeeAssignment | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const row = await tx.employeeAssignment.findFirst({ where: { companyId, employeeId, appliedAt: null } });
      if (row) await tx.employeeAssignment.delete({ where: { id: row.id } });
      return row;
    });
  }

  listDue(companyId: string, today: Date): Promise<EmployeeAssignment[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeAssignment.findMany({ where: { companyId, appliedAt: null, validFrom: { lte: today } }, orderBy: { validFrom: "asc" } }),
    );
  }
}
