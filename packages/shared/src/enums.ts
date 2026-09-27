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

/** No enum is documented for employees.status anywhere — a minimal lifecycle flag,
 * not inventing unspecified HR-policy states (probation, resigned, etc). */
export const EMPLOYEE_STATUSES = ["active", "inactive"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** docs/architecture/data-model.md "salary_components". */
export const SALARY_COMPONENT_TYPES = ["basic", "housing", "transport", "other"] as const;
export type SalaryComponentType = (typeof SALARY_COMPONENT_TYPES)[number];

/** docs/domain/business-rules.md "Documents". */
export const DOCUMENT_TYPES = ["iqama", "passport", "national_id", "contract", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
