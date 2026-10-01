import { z } from "zod";

const DATE = z.string().date();
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const WARNING_TYPES = ["verbal", "written", "final"] as const;
export type WarningType = (typeof WARNING_TYPES)[number];
export type WarningStatus = "proposed" | "issued" | "rejected" | "rescinded";

/** POST /api/v1/warnings — a manager or HR proposes; issuing is a separate step (four eyes when proposer ≠ issuer). */
export const ProposeWarningSchema = z
  .object({
    employeeId: z.string().uuid(),
    type: z.enum(WARNING_TYPES),
    reason: z.string().trim().min(3).max(1000),
    incidentDate: DATE,
  })
  .strict();
export type ProposeWarning = z.infer<typeof ProposeWarningSchema>;

export const DecisionNoteSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
export type DecisionNote = z.infer<typeof DecisionNoteSchema>;
export const RequiredReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type RequiredReason = z.infer<typeof RequiredReasonSchema>;

export interface WarningView {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  type: WarningType;
  reason: string;
  incidentDate: string;
  status: WarningStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  acknowledgedAt: string | null;
  rescindedAt: string | null;
  rescindedReason: string | null;
  /** Issued, not rescinded and within the company's active period. */
  active: boolean;
  createdAt: string;
  /** What the viewer may do with it now. */
  actions: Array<"issue" | "reject" | "rescind" | "acknowledge">;
}

export const SHORTLEAVE_KINDS = ["late_arrival", "early_leave", "mid_day"] as const;
export type ShortLeaveKind = (typeof SHORTLEAVE_KINDS)[number];

/** POST /api/v1/shortleave/requests — part of a working day, times in company time. */
export const CreateShortLeaveSchema = z
  .object({
    date: DATE,
    kind: z.enum(SHORTLEAVE_KINDS),
    fromTime: TIME,
    toTime: TIME,
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((r) => r.toTime > r.fromTime, { message: "to_after_from", path: ["toTime"] });
export type CreateShortLeave = z.infer<typeof CreateShortLeaveSchema>;

export interface ShortLeaveView {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  date: string;
  kind: ShortLeaveKind;
  fromTime: string;
  toTime: string;
  minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionNote: string | null;
  createdAt: string;
  canDecide?: boolean;
}

export interface ShortLeaveAllowance {
  month: string;
  allowanceMinutes: number;
  usedMinutes: number;
  pendingMinutes: number;
  remainingMinutes: number;
  /** The employee's work schedule ("HH:mm"), to pre-fill times and draw the day; null when none applies. */
  schedule: { startTime: string; endTime: string } | null;
}

/** GET /shortleave/allowance — an approver looking at one employee's month. */
export const ShortLeaveAllowanceQuerySchema = z
  .object({
    employeeId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    /** Looking at one request: reach is checked against the branch the request was filed in (ADR-0012). */
    requestId: z.string().uuid().optional(),
  })
  .strict();
export type ShortLeaveAllowanceQuery = z.infer<typeof ShortLeaveAllowanceQuerySchema>;

export const ADJUSTMENT_KINDS = ["deduction", "bonus", "allowance"] as const;

/** business-rules.md "Adjustments": the cap when no `adjustments.max_deduction_percent` setting is in force. */
export const DEFAULT_MAX_DEDUCTION_PERCENT = 50;

/**
 * The most a month's approved deductions may total: `capPercent` (decimals allowed, e.g. 33.33) of the
 * month's pay, in integer halalas. Shared so the API's check and the approver's screen agree exactly.
 */
export function deductionCapHalalas(monthlyPay: bigint, capPercent: number): bigint {
  return (monthlyPay * BigInt(Math.round(capPercent * 100))) / 10_000n;
}
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export const ADJUSTMENT_SOURCES = ["manual", "warning", "absence", "lateness", "custody", "shortleave"] as const;

/** POST /api/v1/adjustments */
export const ProposeAdjustmentSchema = z
  .object({
    employeeId: z.string().uuid(),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM"),
    kind: z.enum(ADJUSTMENT_KINDS),
    amountHalalas: z.string().regex(/^[1-9]\d*$/, "amountHalalas must be a positive integer string"),
    reason: z.string().trim().min(3).max(500),
    source: z.enum(ADJUSTMENT_SOURCES).default("manual"),
    sourceId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type ProposeAdjustment = z.infer<typeof ProposeAdjustmentSchema>;

export const AdjustmentListQuerySchema = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    status: z.enum(["proposed", "approved", "rejected"]).optional(),
    employeeId: z.string().uuid().optional(),
  })
  .strict();
export type AdjustmentListQuery = z.infer<typeof AdjustmentListQuerySchema>;

export interface AdjustmentView {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  period: string;
  kind: AdjustmentKind;
  amountHalalas: string;
  reason: string;
  source: (typeof ADJUSTMENT_SOURCES)[number];
  sourceId: string | null;
  status: "proposed" | "approved" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  canDecide: boolean;
}
