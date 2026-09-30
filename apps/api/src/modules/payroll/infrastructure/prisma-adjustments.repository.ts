import { Injectable } from "@nestjs/common";
import type { PayrollAdjustment } from "@prisma/client";
import type { DataScope } from "../../../shared/access/access-rules";
import { recordScopeWhere } from "../../../shared/access/prisma-scope";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { AdjustmentsRepositoryPort } from "../application/ports/adjustments-repository.port";

@Injectable()
export class PrismaAdjustmentsRepository implements AdjustmentsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  create(
    companyId: string,
    data: Pick<PayrollAdjustment, "employeeId" | "branchId" | "period" | "kind" | "amountHalalas" | "reason" | "source" | "sourceId" | "proposedBy">,
  ): Promise<PayrollAdjustment> {
    return this.db.withTenant(companyId, (tx) => tx.payrollAdjustment.create({ data: { companyId, ...data } }));
  }

  async lock(companyId: string, id: string): Promise<PayrollAdjustment | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM payroll_adjustments WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return rows.length ? tx.payrollAdjustment.findFirst({ where: { id, companyId } }) : null;
    });
  }

  decide(companyId: string, id: string, data: Pick<PayrollAdjustment, "status" | "decidedBy" | "decidedAt" | "decisionNote">): Promise<PayrollAdjustment> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.payrollAdjustment.updateMany({ where: { id, companyId, status: "proposed" }, data });
      return tx.payrollAdjustment.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  list(companyId: string, f: { scope?: DataScope; period?: string; status?: string; employeeIds?: string[] }): Promise<PayrollAdjustment[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.payrollAdjustment.findMany({
        where: {
          companyId,
          ...(f.scope ? recordScopeWhere(f.scope) : {}),
          ...(f.period ? { period: f.period } : {}),
          ...(f.status ? { status: f.status } : {}),
          ...(f.employeeIds ? { employeeId: { in: f.employeeIds } } : {}),
        },
        orderBy: [{ period: "desc" }, { createdAt: "desc" }],
        take: 1000,
      }),
    );
  }

  approvedDeductions(companyId: string, employeeId: string, period: string): Promise<bigint> {
    return this.db.withTenant(companyId, async (tx) => {
      const r = await tx.payrollAdjustment.aggregate({ where: { companyId, employeeId, period, kind: "deduction", status: "approved" }, _sum: { amountHalalas: true } });
      return r._sum.amountHalalas ?? 0n;
    });
  }

  async lockEmployee(companyId: string, employeeId: string): Promise<void> {
    this.db.assertInTransaction();
    await this.db.withTenant(companyId, (tx) => tx.$queryRaw`SELECT id FROM employees WHERE id = ${employeeId}::uuid AND company_id = ${companyId}::uuid FOR NO KEY UPDATE`);
  }
}
