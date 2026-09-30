import type { PayrollAdjustment } from "@prisma/client";
import type { DataScope } from "../../../../shared/access/access-rules";

export const ADJUSTMENTS_REPOSITORY = Symbol("ADJUSTMENTS_REPOSITORY");

export interface AdjustmentsRepositoryPort {
  create(
    companyId: string,
    data: Pick<PayrollAdjustment, "employeeId" | "branchId" | "period" | "kind" | "amountHalalas" | "reason" | "source" | "sourceId" | "proposedBy">,
  ): Promise<PayrollAdjustment>;
  lock(companyId: string, id: string): Promise<PayrollAdjustment | null>;
  decide(companyId: string, id: string, data: Pick<PayrollAdjustment, "status" | "decidedBy" | "decidedAt" | "decisionNote">): Promise<PayrollAdjustment>;
  list(companyId: string, f: { scope?: DataScope; period?: string; status?: string; employeeIds?: string[] }): Promise<PayrollAdjustment[]>;
  /** Approved deductions of one employee for a month (halalas). */
  approvedDeductions(companyId: string, employeeId: string, period: string): Promise<bigint>;
  lockEmployee(companyId: string, employeeId: string): Promise<void>;
}
