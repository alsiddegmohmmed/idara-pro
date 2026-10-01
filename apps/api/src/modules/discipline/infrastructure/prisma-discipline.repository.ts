import { Injectable } from "@nestjs/common";
import type { ShortLeaveRequest, Warning } from "@prisma/client";
import type { DataScope } from "../../../shared/access/access-rules";
import { recordScopeWhere } from "../../../shared/access/prisma-scope";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { DisciplineRepositoryPort } from "../application/ports/discipline-repository.port";

@Injectable()
export class PrismaDisciplineRepository implements DisciplineRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  createWarning(companyId: string, data: Pick<Warning, "employeeId" | "branchId" | "type" | "reason" | "incidentDate" | "proposedBy">): Promise<Warning> {
    return this.db.withTenant(companyId, (tx) => tx.warning.create({ data: { companyId, ...data } }));
  }

  async lockWarning(companyId: string, id: string): Promise<Warning | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM warnings WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return rows.length ? tx.warning.findFirst({ where: { id, companyId } }) : null;
    });
  }

  updateWarning(companyId: string, id: string, data: Partial<Warning>): Promise<Warning> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.warning.updateMany({ where: { id, companyId }, data });
      return tx.warning.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  listWarnings(companyId: string, f: { scope?: DataScope; employeeIds?: string[]; status?: string; statuses?: string[] }): Promise<Warning[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.warning.findMany({
        where: {
          companyId,
          ...(f.scope ? recordScopeWhere(f.scope) : {}),
          ...(f.employeeIds ? { employeeId: { in: f.employeeIds } } : {}),
          ...(f.status ? { status: f.status } : f.statuses ? { status: { in: f.statuses } } : {}),
        },
        orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
    );
  }

  createShortLeave(
    companyId: string,
    data: Pick<ShortLeaveRequest, "employeeId" | "branchId" | "date" | "kind" | "fromTime" | "toTime" | "minutes" | "reason">,
  ): Promise<ShortLeaveRequest> {
    return this.db.withTenant(companyId, (tx) => tx.shortLeaveRequest.create({ data: { companyId, ...data } }));
  }

  findShortLeave(companyId: string, id: string): Promise<ShortLeaveRequest | null> {
    return this.db.withTenant(companyId, (tx) => tx.shortLeaveRequest.findFirst({ where: { id, companyId } }));
  }

  async lockShortLeave(companyId: string, id: string): Promise<ShortLeaveRequest | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM shortleave_requests WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return rows.length ? tx.shortLeaveRequest.findFirst({ where: { id, companyId } }) : null;
    });
  }

  updateShortLeave(companyId: string, id: string, data: Partial<ShortLeaveRequest>): Promise<ShortLeaveRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.shortLeaveRequest.updateMany({ where: { id, companyId }, data });
      return tx.shortLeaveRequest.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  listShortLeave(companyId: string, f: { scope?: DataScope; employeeIds?: string[]; status?: string; from?: Date; to?: Date }): Promise<ShortLeaveRequest[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.shortLeaveRequest.findMany({
        where: {
          companyId,
          ...(f.scope ? recordScopeWhere(f.scope) : {}),
          ...(f.employeeIds ? { employeeId: { in: f.employeeIds } } : {}),
          ...(f.status ? { status: f.status } : {}),
          ...(f.from || f.to ? { date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
        },
        orderBy: [{ date: "desc" }, { fromTime: "asc" }],
        take: 500,
      }),
    );
  }

  async lockEmployee(companyId: string, employeeId: string): Promise<void> {
    this.db.assertInTransaction();
    await this.db.withTenant(companyId, (tx) => tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND company_id = ${companyId}::uuid FOR NO KEY UPDATE`);
  }
}
