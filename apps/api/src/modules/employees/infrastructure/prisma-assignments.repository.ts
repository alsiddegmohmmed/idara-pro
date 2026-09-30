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



}
