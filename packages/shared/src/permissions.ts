/**
 * Permission codes, `resource:action` — the catalog of ADR-0011 §8 (docs/adr/0011-access-control.md).
 * Extend this list as modules are built — do not invent codes elsewhere. Adding a code here also needs a
 * forward-only migration that inserts it into `permissions` and grants it to the system roles that need it.
 */
export const PERMISSIONS = {
  /** See roles, assignments and the access review report. */
  ACCESS_READ: "access:read",
  /** Create/edit roles and assign them to users (no escalation, no self-edit — ADR-0011 §5). */
  ACCESS_MANAGE: "access:manage",

  /** Branches, departments, schedules, holidays, company settings (replaced `company:*`). */
  ORG_READ: "org:read",
  ORG_MANAGE: "org:manage",

  /** Directory: name, number, job title, branch, department, status. */
  EMPLOYEES_READ: "employees:read",
  /** Personal tier: national ID, personal phone/email, address, emergency contact, IBAN. */
  EMPLOYEES_READ_SENSITIVE: "employees:read-sensitive",
  EMPLOYEES_CREATE: "employees:create",
  EMPLOYEES_UPDATE: "employees:update",
  EMPLOYEES_DELETE: "employees:delete",
  EMPLOYEES_INVITE: "employees:invite",
  EMPLOYEES_REVIEW: "employees:review",
  EMPLOYEES_SELF_SERVICE: "employees:self-service",
  /** Restore a deactivated employee's login (re-enable the user, force a new password). */
  EMPLOYEES_MANAGE_ACCESS: "employees:manage-access",
  /** Move an employee to another branch/department/job with an effective date (ADR-0012). */
  EMPLOYEES_TRANSFER: "employees:transfer",

  /** Compensation tier: salary components. HR admin and Accountant by default (ADR-0011 §7). */
  SALARY_READ: "salary:read",
  SALARY_MANAGE: "salary:manage",

  /** Contracts tier (ADR-0011 §3): type, dates, probation, renewals. */
  CONTRACTS_READ: "contracts:read",
  CONTRACTS_MANAGE: "contracts:manage",
  /** Insurance tier: policies and enrolment. */
  INSURANCE_READ: "insurance:read",
  INSURANCE_MANAGE: "insurance:manage",

  /** Check in/out for yourself (own reach, part of the Employee role). */
  ATTENDANCE_PUNCH: "attendance:punch",
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_CORRECT: "attendance:correct",

  LEAVE_READ: "leave:read",
  LEAVE_REQUEST: "leave:request",
  LEAVE_APPROVE: "leave:approve",
  /** Leave policy: yearly entitlements and balance corrections. */
  LEAVE_MANAGE: "leave:manage",

  /** إنذارات: read in reach; propose (managers); issue/reject and rescind (HR). */
  WARNINGS_READ: "warnings:read",
  WARNINGS_PROPOSE: "warnings:propose",
  WARNINGS_ISSUE: "warnings:issue",
  WARNINGS_RESCIND: "warnings:rescind",

  /** الاستئذانات (short permissions): request your own; read / approve in reach. */
  SHORTLEAVE_REQUEST: "shortleave:request",
  SHORTLEAVE_READ: "shortleave:read",
  SHORTLEAVE_APPROVE: "shortleave:approve",

  /** Pay adjustments (deductions, bonuses, allowances): propose, approve (four eyes), read. */
  ADJUSTMENTS_READ: "adjustments:read",
  ADJUSTMENTS_PROPOSE: "adjustments:propose",
  ADJUSTMENTS_APPROVE: "adjustments:approve",

  CUSTODY_READ: "custody:read",
  CUSTODY_REQUEST: "custody:request",
  CUSTODY_APPROVE: "custody:approve",
  CUSTODY_PAY: "custody:pay",
  CUSTODY_SETTLE: "custody:settle",

  PAYROLL_READ: "payroll:read",
  PAYROLL_RUN: "payroll:run",
  PAYROLL_APPROVE: "payroll:approve",

  EXPORTS_CREATE: "exports:create",

  NOTIFICATIONS_READ: "notifications:read",

  AUDIT_READ: "audit:read",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** How far a permission reaches (`role_permissions.scope`, ADR-0011 §1), narrowest first. */
export const ROLE_SCOPES = ["own", "team", "branch", "company"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

/** Where a branch-reach grant applies: the holder's own branch, or an explicit list (ADR-0011 §1). */
export const BRANCH_MODES = ["home", "selected"] as const;
export type BranchMode = (typeof BRANCH_MODES)[number];

const PERMISSION_CODE_PATTERN = /^[a-z]+:[a-z-]+$/;

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODE_PATTERN.test(value) && Object.values(PERMISSIONS).includes(value as PermissionCode);
}
