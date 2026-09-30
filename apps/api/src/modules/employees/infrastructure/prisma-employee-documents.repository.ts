import type { DataScope } from "../../../shared/access/access-rules";
import { employeeScopeWhere } from "../../../shared/access/prisma-scope";
import { Injectable } from "@nestjs/common";
import { Prisma, type EmployeeDocument, type ReviewStatus } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateEmployeeDocumentData,
  EmployeeDocumentsRepositoryPort,
  ExpiringDocumentCandidate,
  PendingDocument,
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

  async listExpiringCandidates(companyId: string, scope: DataScope): Promise<ExpiringDocumentCandidate[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const documents = await tx.employeeDocument.findMany({
        // Only vetted documents: a pending or rejected upload isn't a reason to nag HR.
        where: { companyId, expiryDate: { not: null }, reviewStatus: "approved", employee: { status: "active", ...employeeScopeWhere(scope) } },
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
          branchId: document.employee.branchId,
        },
        notifiedThresholds: document.expiryNotices.map((notice) => notice.thresholdDays),
      }));
    });
  }

  async listPendingReview(companyId: string, scope: DataScope): Promise<PendingDocument[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeDocument.findMany({
        where: { companyId, reviewStatus: "pending_review", employee: employeeScopeWhere(scope) },
        include: { employee: { select: { id: true, userId: true, fullNameAr: true, fullNameEn: true } } },
        orderBy: { createdAt: "asc" },
      }),
    );
  }

  async setReviewStatus(
    companyId: string,
    id: string,
    status: ReviewStatus,
    reason: string | null,
  ): Promise<EmployeeDocument | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employeeDocument.updateMany({
        // Only a still-pending document can be decided (two reviewers can't both win).
        where: { id, companyId, reviewStatus: "pending_review" },
        data: { reviewStatus: status, reviewReason: reason },
      });
      if (count === 0) return null;
      return tx.employeeDocument.findFirst({ where: { id, companyId } });
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
