/**
 * Enums shared by apps/api and apps/web.
 * Source of truth: docs/domain/business-rules.md and docs/architecture/data-model.md.
 */

export const ATTENDANCE_DAY_STATUSES = [
  "present",
  "late",
  "absent",
  "leave",
  "holiday",
  "weekend",
] as const;
export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];

export const PUNCH_KINDS = ["in", "out"] as const;
export type PunchKind = (typeof PUNCH_KINDS)[number];

export const LEAVE_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

/** Custody (عهدة) lifecycle — docs/domain/business-rules.md "Custody". */
export const CUSTODY_STATUSES = ["requested", "approved", "rejected", "paid", "settled"] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = ["draft", "calculated", "approved", "exported"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_RUN_TYPES = ["regular", "adjustment"] as const;
export type PayrollRunType = (typeof PAYROLL_RUN_TYPES)[number];
