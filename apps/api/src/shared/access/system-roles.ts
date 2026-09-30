import { PERMISSIONS, type PermissionCode, type RoleScope } from "@idara-pro/shared";

/**
 * The seeded system roles (ADR-0011 §7). Global rows (company_id null), fixed ids, not editable in the app:
 * a company copies one to customise it. Changing a grant here needs a forward-only migration that applies
 * the same change (the migration `…_access_foundation` was generated from this file); prisma/seed.ts reads
 * it directly for fresh dev databases.
 */
export interface SystemRole {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  description: string;
  /** Nobody holds it yet; the company assigns it when it needs it (ADR-0011 §6.7). */
  template: boolean;
  grants: Partial<Record<PermissionCode, RoleScope>>;
}

export const SUPER_ADMIN_ROLE_ID = "00000000-0000-0000-0000-0000000000f1";
export const EMPLOYEE_ROLE_ID = "00000000-0000-0000-0000-0000000000f2";
export const EXECUTIVE_ROLE_ID = "00000000-0000-0000-0000-0000000000f3";
export const HR_ADMIN_ROLE_ID = "00000000-0000-0000-0000-0000000000f4";
export const ACCOUNTANT_ROLE_ID = "00000000-0000-0000-0000-0000000000f5";
export const MANAGER_ROLE_ID = "00000000-0000-0000-0000-0000000000f6";
export const BRANCH_HR_ROLE_ID = "00000000-0000-0000-0000-0000000000f7";
export const TEAM_LEAD_ROLE_ID = "00000000-0000-0000-0000-0000000000f8";

const P = PERMISSIONS;
const all = (codes: PermissionCode[], scope: RoleScope): Partial<Record<PermissionCode, RoleScope>> =>
  Object.fromEntries(codes.map((c) => [c, scope]));
/** Every role can read its holder's own notifications (an admin account may have no Employee role). */
const OWN_NOTIFICATIONS = { [P.NOTIFICATIONS_READ]: "own" } as const;

const HR_CODES: PermissionCode[] = [
  P.ORG_READ, P.EMPLOYEES_READ, P.EMPLOYEES_READ_SENSITIVE, P.EMPLOYEES_CREATE, P.EMPLOYEES_UPDATE, P.EMPLOYEES_DELETE,
  P.EMPLOYEES_INVITE, P.EMPLOYEES_REVIEW, P.EMPLOYEES_MANAGE_ACCESS, P.EMPLOYEES_TRANSFER, P.SALARY_READ, P.SALARY_MANAGE,
  P.CONTRACTS_READ, P.CONTRACTS_MANAGE, P.INSURANCE_READ, P.INSURANCE_MANAGE,
  P.WARNINGS_READ, P.WARNINGS_PROPOSE, P.WARNINGS_ISSUE, P.WARNINGS_RESCIND, P.SHORTLEAVE_READ, P.SHORTLEAVE_APPROVE,
  P.ADJUSTMENTS_READ, P.ADJUSTMENTS_PROPOSE, P.ADJUSTMENTS_APPROVE,
  P.ATTENDANCE_READ, P.ATTENDANCE_CORRECT, P.LEAVE_READ, P.LEAVE_APPROVE, P.LEAVE_MANAGE, P.CUSTODY_READ,
  P.CUSTODY_APPROVE, P.CUSTODY_SETTLE, P.EXPORTS_CREATE,
];
const MANAGER_CODES: PermissionCode[] = [
  P.EMPLOYEES_READ, P.ATTENDANCE_READ, P.ATTENDANCE_CORRECT, P.LEAVE_READ, P.LEAVE_APPROVE, P.CUSTODY_READ, P.CUSTODY_APPROVE,
  P.WARNINGS_READ, P.WARNINGS_PROPOSE, P.SHORTLEAVE_READ, P.SHORTLEAVE_APPROVE,
];
/** Everyone who signs in: self-service at own reach. Every other role is held on top of this one. */
const EMPLOYEE_GRANTS = all(
  [P.EMPLOYEES_SELF_SERVICE, P.NOTIFICATIONS_READ, P.ATTENDANCE_PUNCH, P.LEAVE_REQUEST, P.CUSTODY_REQUEST, P.SHORTLEAVE_REQUEST],
  "own",
);

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: SUPER_ADMIN_ROLE_ID,
    key: "super_admin",
    nameAr: "مدير النظام",
    nameEn: "Super admin",
    description: "Everything, including managing roles and access.",
    template: false,
    grants: all(Object.values(P), "company"),
  },
  {
    id: EMPLOYEE_ROLE_ID,
    key: "employee",
    nameAr: "موظف",
    nameEn: "Employee",
    description: "Self-service: own profile, salary, attendance, leave and custody requests.",
    template: false,
    grants: EMPLOYEE_GRANTS,
  },
  {
    id: EXECUTIVE_ROLE_ID,
    key: "executive",
    nameAr: "الإدارة العليا",
    nameEn: "Executive",
    description: "Read-only view of every branch. No salaries, no personal data.",
    template: false,
    grants: {
      ...all([P.ORG_READ, P.EMPLOYEES_READ, P.ATTENDANCE_READ, P.LEAVE_READ, P.CUSTODY_READ, P.WARNINGS_READ, P.SHORTLEAVE_READ], "company"),
      ...OWN_NOTIFICATIONS,
    },
  },
  {
    id: HR_ADMIN_ROLE_ID,
    key: "hr_admin",
    nameAr: "مسؤول الموارد البشرية",
    nameEn: "HR admin",
    description: "Runs HR for the whole company, including salaries and personal data.",
    template: false,
    grants: { ...all(HR_CODES, "company"), ...OWN_NOTIFICATIONS, [P.ORG_MANAGE]: "company", [P.ACCESS_READ]: "company", [P.AUDIT_READ]: "company" },
  },
  {
    id: ACCOUNTANT_ROLE_ID,
    key: "accountant",
    nameAr: "المحاسب",
    nameEn: "Accountant",
    description: "Salaries (read), payroll, paying and settling custody, exports.",
    template: false,
    grants: {
      ...all(
        [P.ORG_READ, P.EMPLOYEES_READ, P.SALARY_READ, P.PAYROLL_READ, P.PAYROLL_RUN, P.CUSTODY_READ, P.CUSTODY_PAY,
          P.CUSTODY_SETTLE, P.EXPORTS_CREATE, P.ADJUSTMENTS_READ],
        "company",
      ),
      ...OWN_NOTIFICATIONS,
    },
  },
  {
    id: MANAGER_ROLE_ID,
    key: "manager",
    nameAr: "مدير فرع",
    nameEn: "Branch manager",
    description: "Their branch: attendance, leave and custody approvals. No salaries.",
    template: false,
    grants: { ...all(MANAGER_CODES, "branch"), [P.ORG_READ]: "company", ...OWN_NOTIFICATIONS },
  },
  {
    id: BRANCH_HR_ROLE_ID,
    key: "branch_hr",
    nameAr: "موارد بشرية - فرع",
    nameEn: "Branch HR",
    description: "HR admin's work, limited to the branches it is assigned to.",
    template: true,
    grants: { ...all(HR_CODES, "branch"), [P.ORG_READ]: "company", ...OWN_NOTIFICATIONS },
  },
  {
    id: TEAM_LEAD_ROLE_ID,
    key: "team_lead",
    nameAr: "قائد فريق",
    nameEn: "Team lead",
    description: "Their direct and indirect reports: attendance, leave and custody approvals.",
    template: true,
    grants: { ...all(MANAGER_CODES, "team"), [P.ORG_READ]: "company", ...OWN_NOTIFICATIONS },
  },
];
