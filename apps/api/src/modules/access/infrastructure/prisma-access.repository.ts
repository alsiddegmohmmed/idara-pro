import { Injectable } from "@nestjs/common";
import type { RoleScope } from "@idara-pro/shared";
import { TenantDatabase, type TenantClient } from "../../../shared/database/with-tenant";
import type { AccessRepositoryPort, AssignmentRow, RoleData, RoleRow } from "../application/ports/access-repository.port";

const withGrants = { rolePermissions: { include: { permission: true } } } as const;
const assignmentInclude = { role: true, branches: true } as const;

@Injectable()
export class PrismaAccessRepository implements AccessRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  listRoles(companyId: string): Promise<RoleRow[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.role.findMany({ where: { OR: [{ companyId: null, isSystem: true }, { companyId }] }, include: withGrants, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    );
  }

  findRole(companyId: string, id: string): Promise<RoleRow | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.role.findFirst({ where: { id, OR: [{ companyId: null, isSystem: true }, { companyId }] }, include: withGrants }),
    );
  }

  findRoleByName(companyId: string, name: string): Promise<{ id: string } | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.role.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, OR: [{ companyId: null, isSystem: true }, { companyId }] },
        select: { id: true },
      }),
    );
  }

  private async permissionIds(tx: TenantClient, codes: string[]): Promise<Map<string, string>> {
    const rows = await tx.permission.findMany({ where: { code: { in: codes } } });
    return new Map(rows.map((p) => [p.code, p.id]));
  }

  createRole(companyId: string, data: RoleData, grants: Array<{ code: string; scope: RoleScope }>, createdBy: string): Promise<RoleRow> {
    return this.db.withTenant(companyId, async (tx) => {
      const ids = await this.permissionIds(tx, grants.map((g) => g.code));
      const role = await tx.role.create({ data: { companyId, ...data, isSystem: false, createdBy } });
      await tx.rolePermission.createMany({
        data: grants.filter((g) => ids.has(g.code)).map((g) => ({ roleId: role.id, permissionId: ids.get(g.code) as string, scope: g.scope })),
      });
      return tx.role.findUniqueOrThrow({ where: { id: role.id }, include: withGrants });
    });
  }

  updateRole(companyId: string, id: string, data: Partial<RoleData>, grants: Array<{ code: string; scope: RoleScope }> | undefined): Promise<RoleRow> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.role.updateMany({ where: { id, companyId, isSystem: false }, data });
      if (grants) {
        const ids = await this.permissionIds(tx, grants.map((g) => g.code));
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: grants.filter((g) => ids.has(g.code)).map((g) => ({ roleId: id, permissionId: ids.get(g.code) as string, scope: g.scope })),
        });
      }
      return tx.role.findUniqueOrThrow({ where: { id }, include: withGrants });
    });
  }

  async archiveRole(companyId: string, id: string, at: Date): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.role.updateMany({ where: { id, companyId, isSystem: false }, data: { archivedAt: at } }));
  }

  holdersByRole(companyId: string): Promise<Map<string, number>> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.roleAssignment.groupBy({ by: ["roleId"], where: { companyId, user: { status: "active" } }, _count: { _all: true } });
      return new Map(rows.map((r) => [r.roleId, r._count._all]));
    });
  }

  listAssignments(companyId: string, userId?: string): Promise<AssignmentRow[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.roleAssignment.findMany({ where: { companyId, ...(userId ? { userId } : {}) }, include: assignmentInclude, orderBy: { createdAt: "asc" } }),
    );
  }

  findAssignment(companyId: string, id: string): Promise<AssignmentRow | null> {
    return this.db.withTenant(companyId, (tx) => tx.roleAssignment.findFirst({ where: { id, companyId }, include: assignmentInclude }));
  }

  createAssignment(
    companyId: string,
    data: { userId: string; roleId: string; branchMode: "home" | "selected"; branchIds: string[]; validFrom: Date | null; validTo: Date | null; note: string | null; createdBy: string },
  ): Promise<AssignmentRow> {
    const { branchIds, ...rest } = data;
    return this.db.withTenant(companyId, (tx) =>
      tx.roleAssignment.create({
        data: { companyId, ...rest, branches: branchIds.length ? { create: branchIds.map((branchId) => ({ branchId })) } : undefined },
        include: assignmentInclude,
      }),
    );
  }

  async deleteAssignment(companyId: string, id: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.roleAssignment.deleteMany({ where: { id, companyId } }));
  }

  countActiveHolders(companyId: string, roleId: string, today: Date, excludingAssignmentId: string): Promise<number> {
    return this.db.withTenant(companyId, (tx) =>
      tx.roleAssignment.count({
        where: {
          companyId,
          roleId,
          id: { not: excludingAssignmentId },
          user: { status: "active" },
          AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: today } }] }, { OR: [{ validTo: null }, { validTo: { gte: today } }] }],
        },
      }),
    );
  }
}
