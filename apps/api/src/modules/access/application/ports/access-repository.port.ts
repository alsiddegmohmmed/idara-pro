import type { Prisma } from "@prisma/client";
import type { RoleScope } from "@idara-pro/shared";

export const ACCESS_REPOSITORY = Symbol("ACCESS_REPOSITORY");

export type RoleRow = Prisma.RoleGetPayload<{ include: { rolePermissions: { include: { permission: true } } } }>;
export type AssignmentRow = Prisma.RoleAssignmentGetPayload<{ include: { role: true; branches: true } }>;

export interface RoleData {
  name: string;
  nameAr: string | null;
  description: string | null;
}

/** Roles and role assignments (ADR-0011). Writes run inside the caller's transaction. */
export interface AccessRepositoryPort {
  /** System roles plus this company's own. */
  listRoles(companyId: string): Promise<RoleRow[]>;
  findRole(companyId: string, id: string): Promise<RoleRow | null>;
  findRoleByName(companyId: string, name: string): Promise<{ id: string } | null>;
  createRole(companyId: string, data: RoleData, grants: Array<{ code: string; scope: RoleScope }>, createdBy: string): Promise<RoleRow>;
  updateRole(companyId: string, id: string, data: Partial<RoleData>, grants: Array<{ code: string; scope: RoleScope }> | undefined): Promise<RoleRow>;
  archiveRole(companyId: string, id: string, at: Date): Promise<void>;
  holdersByRole(companyId: string): Promise<Map<string, number>>;
  listAssignments(companyId: string, userId?: string): Promise<AssignmentRow[]>;
  findAssignment(companyId: string, id: string): Promise<AssignmentRow | null>;
  createAssignment(
    companyId: string,
    data: { userId: string; roleId: string; branchMode: "home" | "selected"; branchIds: string[]; validFrom: Date | null; validTo: Date | null; note: string | null; createdBy: string },
  ): Promise<AssignmentRow>;
  deleteAssignment(companyId: string, id: string): Promise<void>;
  /** Active users holding `roleId` through an assignment valid today, other than `excludingAssignmentId`. */
  countActiveHolders(companyId: string, roleId: string, today: Date, excludingAssignmentId: string): Promise<number>;
}
