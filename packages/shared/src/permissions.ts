/**
 * Permission codes, `resource:action` (docs/architecture/data-model.md `permissions.code`).
 * Extend this list as modules are built — do not invent codes elsewhere.
 */
export const PERMISSIONS = {
  EMPLOYEES_READ: "employees:read",
  EMPLOYEES_CREATE: "employees:create",
  EMPLOYEES_UPDATE: "employees:update",
  EMPLOYEES_DELETE: "employees:delete",

  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_CORRECT: "attendance:correct",

  LEAVE_READ: "leave:read",
  LEAVE_REQUEST: "leave:request",
  LEAVE_APPROVE: "leave:approve",

  CUSTODY_READ: "custody:read",
  CUSTODY_REQUEST: "custody:request",
  CUSTODY_APPROVE: "custody:approve",
  CUSTODY_PAY: "custody:pay",
  CUSTODY_SETTLE: "custody:settle",

  PAYROLL_READ: "payroll:read",
  PAYROLL_RUN: "payroll:run",
  PAYROLL_APPROVE: "payroll:approve",

  EXPORTS_CREATE: "exports:create",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** `role_permissions.scope` (docs/architecture/data-model.md). */
export const ROLE_SCOPES = ["own", "team", "branch", "company"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

const PERMISSION_CODE_PATTERN = /^[a-z]+:[a-z]+$/;

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODE_PATTERN.test(value) && Object.values(PERMISSIONS).includes(value as PermissionCode);
}
