import { Inject, Injectable } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import { AccessPolicy } from "../../../shared/access/access-policy.service";
import type { DataScope, ScopeTarget } from "../../../shared/access/access-rules";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { EMPLOYEES_REPOSITORY, type EmployeesRepositoryPort } from "./ports/employees-repository.port";

/** What a scope check needs from a record: its employee and the branch it belongs to. */
export type ScopedRecord = Pick<Employee, "id" | "branchId"> | ScopeTarget;

const toTarget = (r: ScopedRecord): ScopeTarget => ("employeeId" in r ? r : { employeeId: r.id, branchId: r.branchId });

/**
 * Data scope for employee-owned data (ADR-0011 §2, AGENTS.md rule 11), for every module: the route guard
 * checked that the user holds the permission at all; this narrows *whom* it applies to. company = everyone,
 * branch = the assignment's branches, team = direct and indirect reports, own = only me — unioned over
 * every role the user holds. Lists are filtered in SQL, never loaded whole and filtered in memory.
 */
@Injectable()
export class EmployeeScopeService {
  constructor(
    private readonly policy: AccessPolicy,
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
  ) {}

  /** Null when the user doesn't hold the permission at all. */
  scope(user: AuthenticatedUser, permission: string): DataScope | null {
    return this.policy.scopeFor(user.access, permission);
  }

  covers(user: AuthenticatedUser, permission: string, record: ScopedRecord): boolean {
    return this.policy.covers(user.access, permission, toTarget(record));
  }

  async visibleEmployees(user: AuthenticatedUser, permission: string): Promise<Employee[]> {
    const scope = this.scope(user, permission);
    if (!scope) return [];
    return this.employees.list(user.companyId, scope);
  }

  assertCanAccess(user: AuthenticatedUser, permission: string, record: ScopedRecord, errorCode = "out_of_scope"): void {
    if (!this.covers(user, permission, record)) {
      throw new ForbiddenError("This employee is outside your scope", errorCode);
    }
  }

  /** For routes addressed by employee id: 404 outside the company, 403 outside the user's reach. */
  async assertEmployee(user: AuthenticatedUser, permission: string, employeeId: string, errorCode = "employees.out_of_scope"): Promise<Employee> {
    const employee = await this.employees.findById(user.companyId, employeeId);
    if (!employee) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    this.assertCanAccess(user, permission, employee, errorCode);
    return employee;
  }

  /**
   * Everyone who may act on this record with `permission` (ADR-0011 §6.3), minus the employee themself
   * (nobody decides their own request). Approval notifications go to all of them; the first decision wins.
   */
  async eligibleUsers(companyId: string, permission: string, record: ScopedRecord, excludeUserId: string | null): Promise<string[]> {
    const users = await this.policy.usersWhoCan(companyId, permission, toTarget(record));
    return users.filter((id) => id !== excludeUserId);
  }
}
