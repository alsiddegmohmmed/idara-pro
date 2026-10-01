import { Injectable } from "@nestjs/common";
import type { PayrollItem, PayrollRun, Prisma } from "@prisma/client";
import type { DataScope } from "../../../shared/access/access-rules";
import { recordScopeWhere } from "../../../shared/access/prisma-scope";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { NewPayrollItem, PayrollRunsRepositoryPort } from "../application/ports/payroll-runs-repository.port";

@Injectable()
export class PrismaPayrollRunsRepository implements PayrollRunsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  listRuns(companyId: string): Promise<PayrollRun[]> {
    return this.db.withTenant(companyId, (tx) => tx.payrollRun.findMany({ where: { companyId }, orderBy: { period: "desc" } }));
  }

  findRun(companyId: string, id: string): Promise<PayrollRun | null> {
    return this.db.withTenant(companyId, (tx) => tx.payrollRun.findFirst({ where: { id, companyId } }));
  }

  findRunByPeriod(companyId: string, period: string): Promise<PayrollRun | null> {
    return this.db.withTenant(companyId, (tx) => tx.payrollRun.findFirst({ where: { companyId, period } }));
  }

  async lockRun(companyId: string, id: string): Promise<PayrollRun | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM payroll_runs WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return rows.length === 0 ? null : tx.payrollRun.findFirst({ where: { id, companyId } });
    });
  }

  createRun(companyId: string, data: { period: string; calculatedBy: string; calculatedAt: Date; settings: Prisma.InputJsonValue }): Promise<PayrollRun> {
    return this.db.withTenant(companyId, (tx) => tx.payrollRun.create({ data: { companyId, ...data } }));
  }

  updateRun(companyId: string, id: string, data: Prisma.PayrollRunUpdateManyMutationInput): Promise<PayrollRun> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.payrollRun.updateMany({ where: { id, companyId }, data });
      return tx.payrollRun.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  async replaceItems(companyId: string, runId: string, items: NewPayrollItem[]): Promise<void> {
    this.db.assertInTransaction();
    await this.db.withTenant(companyId, async (tx) => {
      await tx.payrollItem.deleteMany({ where: { companyId, runId } });
      if (items.length > 0) await tx.payrollItem.createMany({ data: items.map((i) => ({ ...i, companyId, runId })) });
    });
  }

  listItems(companyId: string, runIds: string[], scope?: DataScope): Promise<PayrollItem[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.payrollItem.findMany({ where: { companyId, runId: { in: runIds }, ...(scope ? recordScopeWhere(scope) : {}) } }),
    );
  }

  findItem(companyId: string, id: string): Promise<(PayrollItem & { run: PayrollRun }) | null> {
    return this.db.withTenant(companyId, (tx) => tx.payrollItem.findFirst({ where: { id, companyId }, include: { run: true } }));
  }

  employeePayslips(companyId: string, employeeId: string): Promise<Array<PayrollItem & { run: PayrollRun }>> {
    return this.db.withTenant(companyId, (tx) =>
      tx.payrollItem.findMany({
        where: { companyId, employeeId, run: { status: { in: ["approved", "exported"] } } },
        include: { run: true },
        orderBy: { run: { period: "desc" } },
      }),
    );
  }

  async linkAdjustments(companyId: string, links: Array<{ adjustmentId: string; itemId: string }>): Promise<void> {
    this.db.assertInTransaction();
    await this.db.withTenant(companyId, async (tx) => {
      for (const link of links) {
        await tx.payrollAdjustment.updateMany({ where: { id: link.adjustmentId, companyId, payrollItemId: null }, data: { payrollItemId: link.itemId } });
      }
    });
  }
}
