import { Injectable } from "@nestjs/common";
import type { BranchMode } from "@idara-pro/shared";
import { TenantDatabase } from "../database/with-tenant";
import { buildGrants, TEAM_MAX_DEPTH, type AccessSnapshot, type AssignmentRow } from "./access-rules";

/**
 * Reads what an access snapshot is built from: the user, their employee record, their team (manager chain)
 * and their role assignments. Shared infrastructure like TenantDatabase: the one place that reads roles,
 * assignments and the org chart together (ADR-0011 §2) so no module hand-rolls it.
 */
@Injectable()
export class AccessSnapshotLoader {
  constructor(private readonly db: TenantDatabase) {}

  /** Null when the user doesn't exist in this company or can't sign in (disabled / never activated). */
  async load(companyId: string, userId: string, today: Date): Promise<AccessSnapshot | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, companyId }, select: { status: true } });
      if (!user || user.status !== "active") return null;

      const employee = await tx.employee.findFirst({ where: { companyId, userId }, select: { id: true, branchId: true } });
      const teamIds = employee
        ? (
            await tx.$queryRaw<Array<{ id: string }>>`
              WITH RECURSIVE team AS (
                SELECT e.id, 1 AS depth FROM employees e
                WHERE e.company_id = ${companyId}::uuid AND e.manager_id = ${employee.id}::uuid
                UNION
                SELECT e.id, t.depth + 1 FROM employees e JOIN team t ON e.manager_id = t.id
                WHERE e.company_id = ${companyId}::uuid AND t.depth < ${TEAM_MAX_DEPTH}
              )
              SELECT DISTINCT id FROM team WHERE id <> ${employee.id}::uuid`
          ).map((r) => r.id)
        : [];

      const rows = await tx.roleAssignment.findMany({
        where: { companyId, userId, role: { archivedAt: null } },
        select: {
          branchMode: true,
          validFrom: true,
          validTo: true,
          branches: { select: { branchId: true } },
          role: { select: { rolePermissions: { select: { scope: true, permission: { select: { code: true } } } } } },
        },
      });
      const assignments: AssignmentRow[] = rows.map((a) => ({
        branchMode: a.branchMode as BranchMode,
        selectedBranchIds: a.branches.map((b) => b.branchId),
        validFrom: a.validFrom,
        validTo: a.validTo,
        grants: a.role.rolePermissions.map((rp) => ({ code: rp.permission.code, scope: rp.scope })),
      }));

      return {
        userId,
        companyId,
        employeeId: employee?.id ?? null,
        homeBranchId: employee?.branchId ?? null,
        teamIds,
        grants: buildGrants(assignments, employee?.branchId ?? null, today),
      };
    });
  }

  /** Active users holding `code` through any non-archived role — the candidates for "who can act on this". */
  async userIdsHolding(companyId: string, code: string): Promise<string[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const users = await tx.user.findMany({
        where: {
          companyId,
          status: "active",
          roleAssignments: { some: { role: { archivedAt: null, rolePermissions: { some: { permission: { code } } } } } },
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    });
  }
}
