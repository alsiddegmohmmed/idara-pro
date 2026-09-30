import { Inject, Injectable } from "@nestjs/common";
import type {
  AccessReviewRow,
  AccessUserView,
  AssignmentAccessView,
  CreateAssignment,
  CreateRole,
  RoleGrantView,
  RoleScope,
  RoleView,
  UpdateRole,
} from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { UsersRepository } from "../../auth";
import { BranchesService } from "../../company";
import { EmployeesService } from "../../employees";
import { AccessPolicy } from "../../../shared/access/access-policy.service";
import { isAssignmentActive, widestReach } from "../../../shared/access/access-rules";
import { SUPER_ADMIN_ROLE_ID } from "../../../shared/access/system-roles";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { assertGrantable, assertKeepsSuperAdmin, assertNotSelf } from "../domain/guardrails";
import { ACCESS_REPOSITORY, type AccessRepositoryPort, type AssignmentRow, type RoleRow } from "./ports/access-repository.port";

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const parse = (v: string | null | undefined): Date | null => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const grantsOf = (role: RoleRow): RoleGrantView[] =>
  role.rolePermissions.map((rp) => ({ code: rp.permission.code as RoleGrantView["code"], scope: rp.scope as RoleScope }));

/**
 * Roles and who holds them (ADR-0011 §5). Roles are data: a company creates, copies, edits and retires its
 * own; system roles are read-only. Guardrails: no escalation (you grant only what you hold, where you hold
 * it), nobody edits their own access, the last Super admin stays. Every change is audited and retires all
 * cached access snapshots of the company once committed.
 */
@Injectable()
export class AccessManagementService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepositoryPort,
    private readonly users: UsersRepository,
    private readonly employees: EmployeesService,
    private readonly branches: BranchesService,
    private readonly policy: AccessPolicy,
    private readonly audit: AuditService,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- roles ----------

  async listRoles(companyId: string): Promise<RoleView[]> {
    const [roles, holders] = await Promise.all([this.repository.listRoles(companyId), this.repository.holdersByRole(companyId)]);
    return roles.map((r) => this.toRoleView(r, holders.get(r.id) ?? 0));
  }

  async createRole(user: AuthenticatedUser, input: CreateRole, ip: string | null): Promise<RoleView> {
    const { companyId } = user;
    assertGrantable(user.access.grants, input.grants);
    return this.db.transaction(companyId, async () => {
      await this.assertNameFree(companyId, input.name);
      const role = await this.repository.createRole(
        companyId,
        { name: input.name, nameAr: input.nameAr ?? null, description: input.description ?? null },
        input.grants,
        user.userId,
      );
      await this.audit.record(companyId, {
        actorId: user.userId, action: "create", entity: "roles", entityId: role.id,
        after: { name: role.name, grants: grantsOf(role) }, ip,
      });
      return this.toRoleView(role, 0);
    });
  }

  async updateRole(user: AuthenticatedUser, id: string, input: UpdateRole, ip: string | null): Promise<RoleView> {
    const { companyId } = user;
    return this.db.transaction(companyId, async () => {
      const before = await this.editableRole(companyId, id);
      if (input.grants) assertGrantable(user.access.grants, input.grants);
      if (input.name && input.name.toLowerCase() !== before.name.toLowerCase()) await this.assertNameFree(companyId, input.name);
      const after = await this.repository.updateRole(companyId, id, {
        name: input.name,
        nameAr: input.nameAr,
        description: input.description,
      }, input.grants);
      await this.audit.record(companyId, {
        actorId: user.userId, action: "update", entity: "roles", entityId: id,
        before: { name: before.name, grants: grantsOf(before) }, after: { name: after.name, grants: grantsOf(after) }, ip,
      });
      await this.accessChanged(companyId);
      return this.toRoleView(after, (await this.repository.holdersByRole(companyId)).get(id) ?? 0);
    });
  }

  /** Retired roles grant nothing and can't be assigned; they stay for history. */
  async archiveRole(user: AuthenticatedUser, id: string, ip: string | null): Promise<void> {
    const { companyId } = user;
    await this.db.transaction(companyId, async () => {
      const role = await this.editableRole(companyId, id);
      if (role.archivedAt) return;
      await this.repository.archiveRole(companyId, id, this.clock.now());
      await this.audit.record(companyId, { actorId: user.userId, action: "archive", entity: "roles", entityId: id, before: { name: role.name }, ip });
      await this.accessChanged(companyId);
    });
  }

  // ---------- people & assignments ----------

  async listUsers(companyId: string): Promise<AccessUserView[]> {
    const today = this.today();
    const [users, assignments] = await Promise.all([this.users.listForCompany(companyId), this.repository.listAssignments(companyId)]);
    const employees = new Map((await this.employees.byUserIds(companyId, users.map((u) => u.id))).map((e) => [e.userId, e]));
    return users.map((u) => {
      const e = employees.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        status: u.status,
        employee: e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn, branchId: e.branchId } : null,
        assignments: assignments.filter((a) => a.userId === u.id).map((a) => this.toAssignmentView(a, today)),
      };
    });
  }

  async assign(user: AuthenticatedUser, input: CreateAssignment, ip: string | null): Promise<AssignmentAccessView> {
    const { companyId } = user;
    assertNotSelf(user.userId, input.userId);
    return this.db.transaction(companyId, async () => {
      const target = await this.users.findById(companyId, input.userId);
      if (!target) throw new NotFoundError("User not found", "access.user.not_found");
      const role = await this.repository.findRole(companyId, input.roleId);
      if (!role) throw new NotFoundError("Role not found", "access.role.not_found");
      if (role.archivedAt) throw new BusinessRuleError("access.role.archived", "This role is retired");
      const branchIds = input.branchMode === "selected" ? [...new Set(input.branchIds)] : [];
      for (const branchId of branchIds) await this.branches.findById(companyId, branchId); // 404 outside the company
      const home = input.branchMode === "home" ? (await this.employees.byUserIds(companyId, [input.userId]))[0]?.branchId ?? null : null;
      assertGrantable(user.access.grants, grantsOf(role), input.branchMode === "selected" ? branchIds : home ? [home] : []);

      const created = await this.repository.createAssignment(companyId, {
        userId: input.userId,
        roleId: role.id,
        branchMode: input.branchMode,
        branchIds,
        validFrom: parse(input.validFrom),
        validTo: parse(input.validTo),
        note: input.note ?? null,
        createdBy: user.userId,
      });
      await this.audit.record(companyId, {
        actorId: user.userId, action: "assign_role", entity: "role_assignments", entityId: created.id,
        after: { userId: input.userId, role: role.name, branchMode: input.branchMode, branchIds, validFrom: input.validFrom ?? null, validTo: input.validTo ?? null },
        ip,
      });
      await this.accessChanged(companyId);
      return this.toAssignmentView(created, this.today());
    });
  }

  async unassign(user: AuthenticatedUser, id: string, ip: string | null): Promise<void> {
    const { companyId } = user;
    await this.db.transaction(companyId, async () => {
      const assignment = await this.repository.findAssignment(companyId, id);
      if (!assignment) throw new NotFoundError("Assignment not found", "access.assignment.not_found");
      assertNotSelf(user.userId, assignment.userId);
      // Taking a role away is as powerful as giving it: the same no-escalation rule applies.
      assertGrantable(user.access.grants, grantsOf((await this.repository.findRole(companyId, assignment.roleId)) as RoleRow));
      if (assignment.roleId === SUPER_ADMIN_ROLE_ID) {
        assertKeepsSuperAdmin(await this.repository.countActiveHolders(companyId, SUPER_ADMIN_ROLE_ID, this.today(), id));
      }
      await this.repository.deleteAssignment(companyId, id);
      await this.audit.record(companyId, {
        actorId: user.userId, action: "unassign_role", entity: "role_assignments", entityId: id,
        before: { userId: assignment.userId, role: assignment.role.name, branchIds: assignment.branches.map((b) => b.branchId) }, ip,
      });
      await this.accessChanged(companyId);
    });
  }

  // ---------- review ----------

  /** Who can do what, where — computed from the same snapshots the guard uses. */
  async review(companyId: string): Promise<AccessReviewRow[]> {
    const users = (await this.users.listForCompany(companyId)).filter((u) => u.status === "active");
    const employees = new Map((await this.employees.byUserIds(companyId, users.map((u) => u.id))).map((e) => [e.userId, e]));
    const rows: AccessReviewRow[] = [];
    for (const u of users) {
      const snapshot = await this.policy.snapshot(companyId, u.id);
      if (!snapshot) continue;
      const e = employees.get(u.id);
      rows.push({
        userId: u.id,
        email: u.email,
        employeeName: e ? { ar: e.fullNameAr, en: e.fullNameEn } : null,
        permissions: Object.entries(snapshot.grants)
          .map(([code, g]) => ({ code, reach: widestReach(g), branchIds: g.company ? [] : g.branchIds }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      });
    }
    return rows;
  }

  // ---------- helpers ----------

  private async editableRole(companyId: string, id: string): Promise<RoleRow> {
    const role = await this.repository.findRole(companyId, id);
    if (!role) throw new NotFoundError("Role not found", "access.role.not_found");
    if (role.isSystem) throw new ForbiddenError("System roles can't be edited; copy it instead", "access.role.system");
    return role;
  }

  private async assertNameFree(companyId: string, name: string): Promise<void> {
    if (await this.repository.findRoleByName(companyId, name)) {
      throw new BusinessRuleError("access.role.name_taken", "A role with this name already exists");
    }
  }

  private accessChanged(companyId: string): Promise<void> {
    return this.db.afterCommit(() => this.policy.invalidateCompany(companyId));
  }

  private today(): Date {
    return companyDateOnly(this.clock.now());
  }

  private toRoleView(r: RoleRow, holders: number): RoleView {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      nameAr: r.nameAr,
      description: r.description,
      isSystem: r.isSystem,
      isTemplate: r.isTemplate,
      archived: r.archivedAt !== null,
      grants: grantsOf(r),
      holders,
    };
  }

  private toAssignmentView(a: AssignmentRow, today: Date): AssignmentAccessView {
    return {
      id: a.id,
      userId: a.userId,
      roleId: a.roleId,
      roleName: a.role.name,
      roleNameAr: a.role.nameAr,
      branchMode: a.branchMode as "home" | "selected",
      branchIds: a.branches.map((b) => b.branchId),
      validFrom: iso(a.validFrom),
      validTo: iso(a.validTo),
      active: isAssignmentActive(a, today) && a.role.archivedAt === null,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
