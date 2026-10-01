import { AccessPolicy } from "../../../shared/access/access-policy.service";
import type { DataScope } from "../../../shared/access/access-rules";
import { Inject, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee } from "@prisma/client";
import type { CreateEmployee, UpdateEmployee } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BranchesService, WorkSchedulesService } from "../../company";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { maskIban } from "@idara-pro/shared";
import { assertManagerNotSelf, assertValidEmployeeDates } from "../domain/employee-rules";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { DepartmentsService } from "./departments.service";
import { EmployeeAssignmentsService } from "./employee-assignments.service";
import {
  EMPLOYEES_REPOSITORY,
  type EmployeeLockMode,
  type EmployeesRepositoryPort,
} from "./ports/employees-repository.port";

/** Audit entries never carry a full IBAN — masked like everywhere else it isn't needed in full. */
function employeeAuditSnapshot(employee: Employee): Record<string, unknown> {
  return { ...toAuditSnapshot(employee), iban: maskIban(employee.iban), pendingIban: maskIban(employee.pendingIban) };
}

/** Payload of "employee.deactivated" and "employee.reactivated" — the auth module listens (no import either
 * way) and cuts off / restores the linked user's login. Listeners run inside the request's transaction, so
 * their writes commit or roll back together with the employee change. */
export interface EmployeeStatusEvent {
  companyId: string;
  employeeId: string;
  /** Null when the employee never got an account (an outstanding invitation is still cancelled). */
  userId: string | null;
  actorId: string;
  ip: string | null;
}

/** emitAsync returns [] when nobody listens (module not loaded, event renamed): that must fail loudly,
 * not read as "nothing to restore". */
function assertHandled(results: unknown[]): void {
  if (results.length === 0) throw new Error('No listener handled "employee.reactivated"');
}

/** Personal-tier fields from a create/update body; undefined = untouched, null = cleared. */
function personalFields(input: UpdateEmployee): Record<string, unknown> {
  return {
    gender: input.gender,
    birthDate: input.birthDate === undefined ? undefined : input.birthDate ? new Date(input.birthDate) : null,
    maritalStatus: input.maritalStatus,
    phone: input.phone,
    additionalPhone: input.additionalPhone,
    personalEmail: input.personalEmail,
  };
}

interface ReferenceIds {
  departmentId?: string | null;
  branchId?: string | null;
  scheduleId?: string | null;
  managerId?: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly repository: EmployeesRepositoryPort,
    private readonly departments: DepartmentsService,
    private readonly branches: BranchesService,
    private readonly schedules: WorkSchedulesService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    private readonly policy: AccessPolicy,
    private readonly assignments: EmployeeAssignmentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Public for transfers: every referenced branch/department/schedule/manager belongs to this company. */
  assertReferences(companyId: string, refs: ReferenceIds): Promise<void> {
    return this.assertReferencesBelongToCompany(companyId, refs);
  }

  /** Branch, manager, status and login link all feed access snapshots (ADR-0011 §4): retire them once committed. */
  private accessChanged(companyId: string): Promise<void> {
    return this.db.afterCommit(() => this.policy.invalidateCompany(companyId));
  }

  /** Employees inside `scope`. Requests get theirs from EmployeeScopeService; system jobs pass SYSTEM_JOB_SCOPE. */
  list(companyId: string, scope: DataScope): Promise<Employee[]> {
    return this.repository.list(companyId, scope);
  }

  /** Employees behind records the caller may already see (e.g. names on a scoped leave list). Not a list endpoint. */
  async byIdsForRecords(companyId: string, ids: string[]): Promise<Map<string, Employee>> {
    return new Map((await this.repository.findByIds(companyId, [...new Set(ids)])).map((e) => [e.id, e]));
  }

  /** PDPL accountability (ADR-0011 §3): someone opened another person's personal or salary data. */
  recordSensitiveView(companyId: string, actorId: string, entity: "employees" | "salary_components", employeeId: string, ip: string | null): Promise<void> {
    return this.audit.record(companyId, { actorId, action: "view", entity, entityId: employeeId, ip });
  }

  /** Employees linked to these logins, for access management's people list (who a user is). */
  byUserIds(companyId: string, userIds: string[]): Promise<Employee[]> {
    return this.repository.findByUserIds(companyId, userIds);
  }

  /** The employee record linked to a login, or null (an admin may have none). */
  findByUserId(companyId: string, userId: string): Promise<Employee | null> {
    return this.repository.findByUserId(companyId, userId);
  }

  async findById(companyId: string, id: string): Promise<Employee> {
    const employee = await this.repository.findById(companyId, id);
    if (!employee) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    return employee;
  }

  /** Each findById already scopes by companyId and throws NotFoundError if the
   * row doesn't exist there — that's the tenant-safety check a raw FK alone
   * can't give us (department/branch/schedule/manager tables are globally,
   * not per-company, unique-keyed). */
  private async assertReferencesBelongToCompany(companyId: string, refs: ReferenceIds): Promise<void> {
    if (refs.departmentId) await this.departments.findById(companyId, refs.departmentId);
    if (refs.branchId) await this.branches.findById(companyId, refs.branchId);
    if (refs.scheduleId) await this.schedules.findById(companyId, refs.scheduleId);
    if (refs.managerId) await this.findById(companyId, refs.managerId);
  }

  async create(companyId: string, actorId: string, input: CreateEmployee, ip: string | null): Promise<Employee> {
    const hireDate = new Date(input.hireDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;
    assertValidEmployeeDates(hireDate, endDate);
    await this.assertReferencesBelongToCompany(companyId, input);

    return this.db.transaction(companyId, async () => {
      const employee = await this.repository.create(companyId, {
        employeeNo: input.employeeNo,
        fullNameAr: input.fullNameAr,
        fullNameEn: input.fullNameEn,
        nationalId: input.nationalId,
        nationality: input.nationality,
        isSaudi: input.isSaudi,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        branchId: input.branchId,
        scheduleId: input.scheduleId,
        managerId: input.managerId,
        hireDate,
        endDate,
        status: input.status,
        iban: input.iban,
        createdBy: actorId,
      });
      await this.audit.record(companyId, {
        actorId,
        action: "create",
        entity: "employees",
        entityId: employee.id,
        after: employeeAuditSnapshot(employee),
        ip,
      });
      // Career history starts on the hire date (ADR-0012).
      await this.assignments.recordHire(companyId, employee, actorId, this.clock.now());
      await this.accessChanged(companyId);
      return employee;
    });
  }

  /**
   * One database transaction for the whole request (field changes, status change, audit, and every access
   * change the auth module makes in response): if anything fails, nothing is saved. The employee row is
   * locked first, so two saves of the same employee run one after the other and `before` is reliable.
   */
  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateEmployee,
    ip: string | null,
    // Setting status=active needs employees:update, but restoring the LOGIN needs employees:manage-access.
    access: { canManageAccess: boolean } = { canManageAccess: false },
  ): Promise<{ employee: Employee; accessRestored: boolean | null }> {
    return this.db.transaction(companyId, async () => {
      await this.accessChanged(companyId);
      // null = this save wasn't a re-activation; true/false = whether the login was restored by it.
      let accessRestored: boolean | null = null;
      // A change to a uniquely-indexed column needs the full row lock; ask for it up front (no mid-way upgrade).
      const before = await this.lockById(companyId, id, input.employeeNo !== undefined || input.nationalId !== undefined ? "key" : "no_key");
      // Nobody changes their own status: a just-deactivated person (stale access token) must not reinstate themselves.
      if (input.status !== undefined && input.status !== before.status && before.userId === actorId) {
        throw new ForbiddenError("You cannot change your own status", "employees.status.own_record");
      }
      // Four eyes: nobody sets their own payroll IBAN directly (they submit it for review instead).
      if (input.iban !== undefined && before.userId === actorId) {
        throw new ForbiddenError("You cannot set your own IBAN directly", "employees.review.own_submission");
      }
      assertManagerNotSelf(id, input.managerId);
      await this.assertReferencesBelongToCompany(companyId, input);

      const hireDate = input.hireDate ? new Date(input.hireDate) : before.hireDate;
      let endDate = input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : before.endDate;
      // Payroll pays up to the end date: deactivating without one ends employment today (never before the hire date).
      const deactivating = input.status === "inactive" && before.status !== "inactive";
      if (deactivating && endDate === null) {
        const today = companyDateOnly(this.clock.now());
        endDate = today.getTime() < hireDate.getTime() ? hireDate : today;
      }
      // Re-activated without a new end date: employment continues (the old end date no longer applies).
      if (input.status === "active" && before.status === "inactive" && input.endDate === undefined) endDate = null;
      assertValidEmployeeDates(hireDate, endDate);

      const after = await this.repository.update(companyId, id, {
        employeeNo: input.employeeNo,
        fullNameAr: input.fullNameAr,
        fullNameEn: input.fullNameEn,
        nationalId: input.nationalId,
        nationality: input.nationality,
        isSaudi: input.isSaudi,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        branchId: input.branchId,
        scheduleId: input.scheduleId,
        managerId: input.managerId,
        status: input.status,
        iban: input.iban,
        // An HR-entered IBAN replaces any submission still waiting for review.
        ...(input.iban !== undefined ? { pendingIban: null, ibanReviewStatus: null, ibanReviewReason: null } : {}),
        hireDate: input.hireDate ? hireDate : undefined,
        endDate: endDate?.getTime() !== before.endDate?.getTime() ? endDate : undefined,
        ...personalFields(input),
      });
      if (!after) throw new NotFoundError("Employee not found", "employees.employee.not_found");
      await this.audit.record(companyId, {
        actorId,
        action: "update",
        entity: "employees",
        entityId: id,
        before: employeeAuditSnapshot(before),
        after: employeeAuditSnapshot(after),
        ip,
      });
      // Branch/department/job/manager/schedule edits are career history too, effective today.
      const now = this.clock.now();
      await this.assignments.recordEdit(companyId, before, after, companyDateOnly(now), actorId, now);
      if (input.status === "active" && before.status === "inactive" && after.userId) {
        // Nobody restores their own access, and update permission alone never does.
        accessRestored = false;
        if (access.canManageAccess && after.userId !== actorId) {
          accessRestored = await this.requestRestore(companyId, id, after.userId, actorId, ip);
        }
      }
      if (input.status === "inactive") {
        await this.emitDeactivated(companyId, id, after.userId, actorId, ip);
      }
      return { employee: after, accessRestored };
    });
  }

  /**
   * Explicit "restore access" for an employee who is active again but whose login is still disabled
   * (status was flipped by someone without employees:manage-access). Same effect as re-activation by
   * a manager: user re-enabled, old password destroyed, password-set link emailed (after commit).
   * Never for yourself. Runs in one transaction, holding the employee row so a concurrent deactivation
   * waits and then disables the user again.
   */
  async restoreAccess(companyId: string, actorId: string, id: string, ip: string | null): Promise<void> {
    await this.db.transaction(companyId, async () => {
      await this.accessChanged(companyId);
      const employee = await this.lockById(companyId, id);
      if (!employee.userId) {
        throw new BusinessRuleError("employees.access.no_account", "This employee has no login to restore");
      }
      if (employee.userId === actorId) {
        throw new ForbiddenError("You cannot restore your own access", "employees.access.own_account");
      }
      if (employee.status !== "active") {
        throw new BusinessRuleError("employees.access.employee_inactive", "Set the employee to active first");
      }
      if (!(await this.requestRestore(companyId, id, employee.userId, actorId, ip))) {
        throw new BusinessRuleError("employees.access.nothing_to_restore", "This employee's login is not disabled");
      }
    });
  }

  async remove(companyId: string, actorId: string, id: string, ip: string | null): Promise<void> {
    await this.db.transaction(companyId, async () => {
      await this.accessChanged(companyId);
      const before = await this.lockById(companyId, id, "key"); // DELETE needs the full lock anyway
      const deleted = await this.repository.delete(companyId, id);
      if (!deleted) throw new NotFoundError("Employee not found", "employees.employee.not_found");
      await this.audit.record(companyId, {
        actorId,
        action: "delete",
        entity: "employees",
        entityId: id,
        before: employeeAuditSnapshot(before),
        ip,
      });
      // A deleted employee's account must not keep working either.
      await this.emitDeactivated(companyId, id, before.userId, actorId, ip);
    });
  }

  /** The employee row, locked until the surrounding transaction ends (throws if it isn't in this company). */
  private async lockById(companyId: string, id: string, mode: EmployeeLockMode = "no_key"): Promise<Employee> {
    const employee = await this.repository.findByIdForUpdate(companyId, id, mode);
    if (!employee) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    return employee;
  }

  /** Emits the restore request; the auth module's listener does the work and answers true if it restored a login. */
  private async requestRestore(companyId: string, id: string, userId: string, actorId: string, ip: string | null): Promise<boolean> {
    const results = await this.events.emitAsync("employee.reactivated", {
      companyId, employeeId: id, userId, actorId, ip,
    } satisfies EmployeeStatusEvent);
    assertHandled(results);
    return results.some((r: unknown) => r === true);
  }

  private async emitDeactivated(
    companyId: string,
    employeeId: string,
    userId: string | null,
    actorId: string,
    ip: string | null,
  ): Promise<void> {
    await this.events.emitAsync("employee.deactivated", {
      companyId,
      employeeId,
      userId,
      actorId,
      ip,
    } satisfies EmployeeStatusEvent);
  }
}
