import { Injectable } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import type { RoleScope } from "@idara-pro/shared";
import { UsersRepository } from "../../auth";
import { EmployeesService } from "../../employees";
import { ForbiddenError } from "../../../shared/errors/errors";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";

/**
 * Role scopes for attendance (docs/product/spec.md "Users and roles"): company = everyone,
 * branch = my branch, team = my direct reports (employees.manager_id = me), own = only me.
 * The route guard already checked the permission code; this narrows *whom* it applies to.
 */
@Injectable()
export class AttendanceScope {
  constructor(
    private readonly users: UsersRepository,
    private readonly employees: EmployeesService,
  ) {}

  async visibleEmployees(user: AuthenticatedUser, permission: string): Promise<Employee[]> {
    const scope = await this.users.findPermissionScope(user.companyId, user.userId, permission);
    if (!scope) return [];
    const all = await this.employees.list(user.companyId);
    if (scope === "company") return all;
    const me = all.find((e) => e.userId === user.userId);
    if (!me) return [];
    return all.filter((e) => this.inScope(scope, me, e));
  }

  async assertCanAccess(user: AuthenticatedUser, permission: string, employee: Employee): Promise<void> {
    const scope = await this.users.findPermissionScope(user.companyId, user.userId, permission);
    if (scope === "company") return;
    const me = scope ? await this.employees.findByUserId(user.companyId, user.userId) : null;
    if (!scope || !me || !this.inScope(scope, me, employee)) {
      throw new ForbiddenError("This employee is outside your scope", "attendance.out_of_scope");
    }
  }

  private inScope(scope: RoleScope, me: Employee, e: Employee): boolean {
    switch (scope) {
      case "company":
        return true;
      case "branch":
        return me.branchId !== null && e.branchId === me.branchId;
      case "team":
        return e.managerId === me.id;
      case "own":
        return e.id === me.id;
    }
  }
}
