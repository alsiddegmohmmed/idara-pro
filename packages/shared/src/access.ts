import { z } from "zod";
import { BRANCH_MODES, PERMISSIONS, ROLE_SCOPES, type PermissionCode, type RoleScope } from "./permissions.js";

/** Access management (ADR-0011 §5). All bodies `.strict()`. */

const PermissionCodeSchema = z.enum(Object.values(PERMISSIONS) as [PermissionCode, ...PermissionCode[]]);

export const RoleGrantSchema = z.object({ code: PermissionCodeSchema, scope: z.enum(ROLE_SCOPES) }).strict();

/** POST /api/v1/access/roles — a company role; copy a system role by passing its grants. */
export const CreateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    nameAr: z.string().trim().min(1).max(80).nullable().optional(),
    description: z.string().trim().max(300).nullable().optional(),
    grants: z.array(RoleGrantSchema).max(200),
  })
  .strict()
  .refine((r) => new Set(r.grants.map((g) => g.code)).size === r.grants.length, { message: "duplicate_permission", path: ["grants"] });
export type CreateRole = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    nameAr: z.string().trim().min(1).max(80).nullable().optional(),
    description: z.string().trim().max(300).nullable().optional(),
    grants: z.array(RoleGrantSchema).max(200).optional(),
  })
  .strict()
  .refine((r) => !r.grants || new Set(r.grants.map((g) => g.code)).size === r.grants.length, { message: "duplicate_permission", path: ["grants"] });
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

/** POST /api/v1/access/assignments — give a user a role, where it applies and for how long. */
export const CreateAssignmentSchema = z
  .object({
    userId: z.string().uuid(),
    roleId: z.string().uuid(),
    branchMode: z.enum(BRANCH_MODES).default("home"),
    branchIds: z.array(z.string().uuid()).max(100).default([]),
    validFrom: z.string().date().nullable().optional(),
    validTo: z.string().date().nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine((a) => a.branchMode === "home" || a.branchIds.length > 0, { message: "branches_required", path: ["branchIds"] })
  .refine((a) => !a.validFrom || !a.validTo || a.validFrom <= a.validTo, { message: "invalid_dates", path: ["validTo"] });
export type CreateAssignment = z.infer<typeof CreateAssignmentSchema>;

export interface RoleGrantView {
  code: PermissionCode;
  scope: RoleScope;
}

export interface RoleView {
  id: string;
  key: string | null;
  name: string;
  nameAr: string | null;
  description: string | null;
  isSystem: boolean;
  isTemplate: boolean;
  archived: boolean;
  grants: RoleGrantView[];
  /** People holding it now (active assignments). */
  holders: number;
}

export interface AssignmentAccessView {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleNameAr: string | null;
  branchMode: "home" | "selected";
  branchIds: string[];
  validFrom: string | null;
  validTo: string | null;
  /** Within its dates today. */
  active: boolean;
  note: string | null;
  createdAt: string;
}

export interface AccessUserView {
  userId: string;
  email: string;
  status: "active" | "invited" | "disabled";
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string; branchId: string | null } | null;
  assignments: AssignmentAccessView[];
}

/** GET /api/v1/access/review — who can do what, where (ADR-0011 §5). */
export interface AccessReviewRow {
  userId: string;
  email: string;
  employeeName: { ar: string; en: string } | null;
  permissions: Array<{ code: string; reach: RoleScope; branchIds: string[] }>;
}

/** GET /api/v1/audit — newest first, cursor-paginated (docs/architecture/overview.md). */
export const AuditQuerySchema = z
  .object({
    entity: z.string().trim().min(1).max(60).optional(),
    entityId: z.string().uuid().optional(),
    actorId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(60).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export interface AuditEntryView {
  id: string;
  at: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
}

export interface AuditPage {
  items: AuditEntryView[];
  nextCursor: string | null;
}
