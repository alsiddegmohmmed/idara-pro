import { z } from "zod";
import type { PayrollRunStatus } from "./enums.js";

const PERIOD = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

/** POST /api/v1/payroll-runs — accepts an Idempotency-Key header. */
export const CreatePayrollRunSchema = z.object({ period: PERIOD }).strict();
export type CreatePayrollRun = z.infer<typeof CreatePayrollRunSchema>;


export const PAYROLL_WARNINGS = ["negative_net", "over_deduction_cap", "no_salary", "no_iban"] as const;
export type PayrollWarning = (typeof PAYROLL_WARNINGS)[number];

/** Amounts are integer halalas as strings (bigint-safe over JSON). */
export interface PayrollTotals {
  employees: number;
  grossHalalas: string;
  deductionsHalalas: string;
  additionsHalalas: string;
  gosiEmployeeHalalas: string;
  gosiEmployerHalalas: string;
  netHalalas: string;
  warnings: number;
}

export interface PayrollRunView {
  id: string;
  period: string;
  status: PayrollRunStatus;
  calculatedAt: string;
  approvedAt: string | null;
  exportedAt: string | null;
  /** Totals over the items the caller may see. */
  totals: PayrollTotals;
  canRecalculate: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export interface PayrollItemBreakdown {
  employedDays: number;
  absentDays: number;
  lateMinutes: number;
  dayMinutes: number;
  unpaidLeaveDays: number;
  tieredLeaveDays: number;
  leaveDays: Record<string, number>;
  adjustments: Array<{ id: string; kind: "deduction" | "bonus" | "allowance"; amountHalalas: string; reason: string }>;
  gosiBaseHalalas: string;
  saudi: boolean;
  warnings: PayrollWarning[];
}

export interface PayrollItemView {
  id: string;
  runId: string;
  period: string;
  status: PayrollRunStatus;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string; jobTitle: string | null } | null;
  branchId: string | null;
  paidDays: number;
  basicHalalas: string;
  housingHalalas: string;
  transportHalalas: string;
  otherHalalas: string;
  grossHalalas: string;
  absenceHalalas: string;
  latenessHalalas: string;
  unpaidLeaveHalalas: string;
  tieredLeaveHalalas: string;
  additionsHalalas: string;
  deductionsHalalas: string;
  gosiEmployeeHalalas: string;
  gosiEmployerHalalas: string;
  netHalalas: string;
  /** Masked except the last 4 characters. */
  ibanMasked: string | null;
  breakdown: PayrollItemBreakdown;
}

export interface PayrollRunDetail extends PayrollRunView {
  items: PayrollItemView[];
}
