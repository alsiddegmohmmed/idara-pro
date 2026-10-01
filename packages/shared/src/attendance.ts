import { z } from "zod";

/** All request bodies/queries are `.strict()` — unknown fields rejected (AGENTS.md §4 rule 5). */

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "leave", "holiday", "weekend"] as const;
export type AttendanceStatusCode = (typeof ATTENDANCE_STATUSES)[number];

/** POST /attendance/punches — location comes from the phone; the server judges it. */
export const CreatePunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative(),
    deviceInfo: z.string().max(300).optional(),
  })
  .strict();
export type CreatePunch = z.infer<typeof CreatePunchSchema>;

export const DateRangeQuerySchema = z
  .object({ from: DATE, to: DATE })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

export const AttendanceDaysQuerySchema = z
  .object({
    from: DATE,
    to: DATE,
    employeeId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type AttendanceDaysQuery = z.infer<typeof AttendanceDaysQuerySchema>;

export const AttendanceBoardQuerySchema = z.object({ date: DATE.optional(), branchId: z.string().uuid().optional() }).strict();
export type AttendanceBoardQuery = z.infer<typeof AttendanceBoardQuerySchema>;

export const AttendanceReportQuerySchema = z.object({ month: MONTH, branchId: z.string().uuid().optional() }).strict();
export type AttendanceReportQuery = z.infer<typeof AttendanceReportQuerySchema>;

/**
 * A correction sets the day's check-in/out times (ISO instants) and/or its status, with a mandatory
 * reason. Omitted fields keep their current value; null clears a time.
 */
export const CorrectAttendanceSchema = z
  .object({
    employeeId: z.string().uuid(),
    workDate: DATE,
    firstInAt: z.string().datetime({ offset: true }).nullable().optional(),
    lastOutAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((c) => c.firstInAt !== undefined || c.lastOutAt !== undefined || c.status !== undefined, {
    message: "Change at least one of firstInAt, lastOutAt or status",
    path: ["status"],
  });
export type CorrectAttendance = z.infer<typeof CorrectAttendanceSchema>;

/** Company settings the attendance module reads; values are validated per key on write. */
export const COMPANY_SETTING_KEYS = {
  MAX_GPS_ACCURACY_M: "attendance.max_gps_accuracy_m",
  /** Default probation length for a new contract (owner default 2026-09-30: 90 days). */
  CONTRACT_PROBATION_DAYS: "contracts.default_probation_days",
  /** How many days ahead contract / probation / insurance ends are announced. */
  ALERT_DAYS_BEFORE: "alerts.days_before",
  /** How long an issued warning counts as active (days). Policy TBD — default 180. */
  WARNING_ACTIVE_DAYS: "warnings.active_days",
  /** Short-permission allowance per month, in minutes. Policy TBD — default 240 (4 hours). */
  SHORTLEAVE_MONTHLY_MINUTES: "shortleave.monthly_minutes",
  /** Legal cap on deductions per month, % of monthly pay. Default 50 (Labor Law) — confirm with HR/legal. */
  MAX_DEDUCTION_PERCENT: "adjustments.max_deduction_percent",
  /** GOSI rates (percent, may have decimals) and the contributory-wage cap (SAR) — confirm with GOSI before go-live. */
  GOSI_SAUDI_EMPLOYEE_PERCENT: "payroll.gosi_saudi_employee_percent",
  GOSI_SAUDI_EMPLOYER_PERCENT: "payroll.gosi_saudi_employer_percent",
  GOSI_NON_SAUDI_EMPLOYEE_PERCENT: "payroll.gosi_non_saudi_employee_percent",
  GOSI_NON_SAUDI_EMPLOYER_PERCENT: "payroll.gosi_non_saudi_employer_percent",
  GOSI_BASE_CAP_SAR: "payroll.gosi_base_cap_sar",
  /** 1 = an absent day is (basic + housing) / 30 (owner default); 0 = basic / 30. */
  ABSENCE_INCLUDES_HOUSING: "payroll.absence_includes_housing",
  /** 1 = late minutes are deducted per minute (owner default); 0 = no lateness deduction. */
  LATENESS_DEDUCTION: "payroll.lateness_deduction",
} as const;

export const UpsertCompanySettingSchema = z
  .object({ value: z.number().min(0).max(10_000), effectiveFrom: DATE })
  .strict();
export type UpsertCompanySetting = z.infer<typeof UpsertCompanySettingSchema>;
