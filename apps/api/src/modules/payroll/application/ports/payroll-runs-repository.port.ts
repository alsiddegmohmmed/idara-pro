import type { PayrollItem, PayrollRun, Prisma } from "@prisma/client";
import type { DataScope } from "../../../../shared/access/access-rules";

export const PAYROLL_RUNS_REPOSITORY = Symbol("PAYROLL_RUNS_REPOSITORY");

export type NewPayrollItem = Omit<Prisma.PayrollItemUncheckedCreateInput, "companyId" | "runId" | "id" | "createdAt">;

export interface PayrollRunsRepositoryPort {
  listRuns(companyId: string): Promise<PayrollRun[]>;
  findRun(companyId: string, id: string): Promise<PayrollRun | null>;
  findRunByPeriod(companyId: string, period: string): Promise<PayrollRun | null>;
  /** Row lock until the transaction ends (calculate / approve / export never interleave). */
  lockRun(companyId: string, id: string): Promise<PayrollRun | null>;
  /** Shared lock on a month's run (if any): waits for, and blocks, an approval of it until the transaction ends. */
  shareRunByPeriod(companyId: string, period: string): Promise<{ status: string } | null>;
  createRun(companyId: string, data: { period: string; calculatedBy: string; calculatedAt: Date; settings: Prisma.InputJsonValue }): Promise<PayrollRun>;
  updateRun(companyId: string, id: string, data: Prisma.PayrollRunUpdateManyMutationInput): Promise<PayrollRun>;
  replaceItems(companyId: string, runId: string, items: NewPayrollItem[]): Promise<void>;
  /** `scope` filters by each item's branch snapshot (ADR-0011: always passed). */
  listItems(companyId: string, runIds: string[], scope: DataScope): Promise<PayrollItem[]>;
  findItem(companyId: string, id: string): Promise<(PayrollItem & { run: PayrollRun }) | null>;
  /** One employee's items in approved / exported runs, newest first — their payslips. */
  employeePayslips(companyId: string, employeeId: string): Promise<Array<PayrollItem & { run: PayrollRun }>>;
  /** Marks the adjustments a run paid, so they can't be paid twice. */
  linkAdjustments(companyId: string, links: Array<{ adjustmentId: string; itemId: string }>): Promise<void>;
}
