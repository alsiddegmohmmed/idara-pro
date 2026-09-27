import { Injectable } from "@nestjs/common";
import { Prisma, type EmployeeDocument } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateEmployeeDocumentData,
  EmployeeDocumentsRepositoryPort,
  ExpiringDocumentCandidate,
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

  async listExpiringCandidates(companyId: string): Promise<ExpiringDocumentCandidate[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const documents = await tx.employeeDocument.findMany({
        where: { companyId, expiryDate: { not: null }, employee: { status: "active" } },
        include: { employee: true, expiryNotices: true },
      });
      return documents.map((document) => ({
        id: document.id,
        type: document.type,
        // Guaranteed non-null by the `where` filter above.
        expiryDate: document.expiryDate as Date,
        employee: {
          id: document.employee.id,
          fullNameAr: document.employee.fullNameAr,
          fullNameEn: document.employee.fullNameEn,
          userId: document.employee.userId,
        },
        notifiedThresholds: document.expiryNotices.map((notice) => notice.thresholdDays),
      }));
    });
  }

  async recordExpiryNotice(companyId: string, documentId: string, thresholdDays: number): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      try {
        await tx.documentExpiryNotice.create({ data: { companyId, documentId, thresholdDays } });
        return true;
      } catch (error) {
        // P2002 = unique constraint violation — another run already recorded
        // this (documentId, thresholdDays) pair; not an error, just a no-op.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return false;
        }
        throw error;
      }
    });
  }
}
