import { Injectable } from "@nestjs/common";
import type { EmployeeDocument } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateEmployeeDocumentData,
  EmployeeDocumentsRepositoryPort,
  UpdateEmployeeDocumentData,
} from "../application/ports/employee-documents-repository.port";

@Injectable()
export class PrismaEmployeeDocumentsRepository implements EmployeeDocumentsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async listByEmployee(companyId: string, employeeId: string): Promise<EmployeeDocument[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeDocument.findMany({ where: { companyId, employeeId } }),
    );
  }

  async findById(companyId: string, id: string): Promise<EmployeeDocument | null> {
    return this.db.withTenant(companyId, (tx) => tx.employeeDocument.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateEmployeeDocumentData): Promise<EmployeeDocument> {
    return this.db.withTenant(companyId, (tx) => tx.employeeDocument.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateEmployeeDocumentData): Promise<EmployeeDocument | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employeeDocument.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.employeeDocument.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employeeDocument.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }
}
