import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee, EmployeeAssignment } from "@prisma/client";
import { PERMISSIONS, type AssignmentView, type TransferEmployee } from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { BranchesService } from "../../company";
import { AccessPolicy } from "../../../shared/access/access-policy.service";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import {
  NOTIFY_USERS_EVENT,
  type NotifyUsersEvent,
} from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { isScheduled, sameAssignment, type AssignmentValues } from "../domain/assignment-rules";
import { assertManagerNotSelf } from "../domain/employee-rules";
import {
  assignmentValuesOf,
  EmployeeAssignmentsService,
  toAssignmentView,
} from "./employee-assignments.service";
import { EmployeeScopeService } from "./employee-scope.service";
import { EmployeesService } from "./employees.service";
import {
  EMPLOYEES_REPOSITORY,
  type EmployeesRepositoryPort,
} from "./ports/employees-repository.port";

const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export interface TransferResult {
  employee: Employee;
  /** Set when the change is future-dated and waits for the nightly job. */
  scheduled: AssignmentView | null;
}

/**
 * Transfers, promotions and manager changes with an effective date (ADR-0012). Needs employees:transfer
 * reaching the employee now and the branch they move to. Today or earlier applies at once — the employee's
 * current values change, records already created keep their branch snapshot; a later date is scheduled and
 * applied by the nightly job. Audited; the employee and the approvers of both branches are told.
 */
@Injectable()
export class TransferEmployeeUseCase {
  private readonly logger = new Logger(TransferEmployeeUseCase.name);

  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    private readonly employeesService: EmployeesService,
    private readonly assignments: EmployeeAssignmentsService,
    private readonly scope: EmployeeScopeService,
    private readonly branches: BranchesService,
    private readonly policy: AccessPolicy,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    user: AuthenticatedUser,
    employeeId: string,
    input: TransferEmployee,
    ip: string | null,
  ): Promise<TransferResult> {
    const { companyId } = user;
    const effective = parseDate(input.effectiveDate);
    const now = this.clock.now();
    const today = companyDateOnly(now);

    const result = await this.db.transaction(companyId, async () => {
      const before = await this.employees.findByIdForUpdate(companyId, employeeId);
      if (!before) throw new NotFoundError("Employee not found", "employees.employee.not_found");
      this.scope.assertCanAccess(
        user,
        PERMISSIONS.EMPLOYEES_TRANSFER,
        before,
        "employees.transfer_forbidden",
      );

      const target: AssignmentValues = {
        branchId: input.branchId !== undefined ? input.branchId : before.branchId,
        departmentId: input.departmentId !== undefined ? input.departmentId : before.departmentId,
        jobTitle: input.jobTitle !== undefined ? input.jobTitle : before.jobTitle,
        managerId: input.managerId !== undefined ? input.managerId : before.managerId,
        scheduleId: input.scheduleId !== undefined ? input.scheduleId : before.scheduleId,
      };
      if (sameAssignment(assignmentValuesOf(before), target)) {
        throw new BusinessRuleError("employees.transfer.nothing_to_change", "Nothing would change");
      }
      if (target.branchId !== before.branchId) {
        this.scope.assertCanAccess(
          user,
          PERMISSIONS.EMPLOYEES_TRANSFER,
          { employeeId, branchId: target.branchId },
          "employees.branch_out_of_scope",
        );
      }
      if (effective.getTime() < before.hireDate.getTime()) {
        throw new BusinessRuleError(
          "employees.transfer.before_hire",
          "The effective date is before the hire date",
        );
      }
      assertManagerNotSelf(employeeId, target.managerId);
      await this.employeesService.assertReferences(companyId, target);

      if (isScheduled(effective, today)) {
        const row = await this.assignments.schedule(
          companyId,
          employeeId,
          target,
          effective,
          input.reason,
          user.userId,
        );
        await this.audit.record(companyId, {
          actorId: user.userId,
          action: "schedule_transfer",
          entity: "employees",
          entityId: employeeId,
          before: assignmentValuesOf(before) as unknown as Record<string, unknown>,
          after: { ...target, effectiveDate: input.effectiveDate, reason: input.reason },
          ip,
        });
        return { before, employee: before, scheduled: row };
      }

      await this.assignments.apply(
        companyId,
        employeeId,
        target,
        effective,
        "transfer",
        input.reason,
        user.userId,
        now,
      );
      const after = await this.employees.update(companyId, employeeId, target);
      if (!after) throw new NotFoundError("Employee not found", "employees.employee.not_found");
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "transfer",
        entity: "employees",
        entityId: employeeId,
        before: assignmentValuesOf(before) as unknown as Record<string, unknown>,
        after: { ...target, effectiveDate: input.effectiveDate, reason: input.reason },
        ip,
      });
      // Branch and manager feed everyone's reach.
      await this.db.afterCommit(() => this.policy.invalidateCompany(companyId));
      return { before, employee: after, scheduled: null as EmployeeAssignment | null };
    });

    await this.notify(
      companyId,
      result.before,
      result.employee,
      result.scheduled ? assignmentValuesOf(result.scheduled) : null,
      input.effectiveDate,
    );
    return {
      employee: result.employee,
      scheduled: result.scheduled ? toAssignmentView(result.scheduled) : null,
    };
  }

  async cancelScheduled(
    user: AuthenticatedUser,
    employeeId: string,
    ip: string | null,
  ): Promise<void> {
    const { companyId } = user;
    await this.db.transaction(companyId, async () => {
      const employee = await this.employees.findByIdForUpdate(companyId, employeeId);
      if (!employee) throw new NotFoundError("Employee not found", "employees.employee.not_found");
      this.scope.assertCanAccess(
        user,
        PERMISSIONS.EMPLOYEES_TRANSFER,
        employee,
        "employees.transfer_forbidden",
      );
      const removed = await this.assignments.cancelScheduled(companyId, employeeId);
      if (!removed)
        throw new NotFoundError("No scheduled change", "employees.transfer.none_scheduled");
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "cancel_transfer",
        entity: "employees",
        entityId: employeeId,
        before: toAssignmentView(removed) as unknown as Record<string, unknown>,
        ip,
      });
    });
  }

  /** Nightly (worker): applies every scheduled change whose date has come, one employee per transaction. */
  async applyDue(companyId: string): Promise<number> {
    const now = this.clock.now();
    const today = companyDateOnly(now);
    let applied = 0;
    for (const row of await this.assignments.listDue(companyId, today)) {
      try {
        const done = await this.db.transaction(companyId, async () => {
          const before = await this.employees.findByIdForUpdate(companyId, row.employeeId);
          const still = await this.assignments.findScheduled(companyId, row.employeeId);
          if (!before || still?.id !== row.id) return null; // cancelled or replaced meanwhile
          await this.assignments.applyScheduled(companyId, row, now);
          const after = await this.employees.update(
            companyId,
            row.employeeId,
            assignmentValuesOf(row),
          );
          await this.audit.record(companyId, {
            actorId: null,
            action: "transfer",
            entity: "employees",
            entityId: row.employeeId,
            before: assignmentValuesOf(before) as unknown as Record<string, unknown>,
            after: {
              ...assignmentValuesOf(row),
              effectiveDate: row.validFrom.toISOString().slice(0, 10),
              reason: row.reason,
              scheduledBy: row.createdBy,
            },
            ip: null,
          });
          return after ? { before, after } : null;
        });
        if (done) {
          applied += 1;
          await this.notify(
            companyId,
            done.before,
            done.after,
            null,
            row.validFrom.toISOString().slice(0, 10),
          );
        }
      } catch (error) {
        // One bad row (e.g. a branch deleted meanwhile) must not block the others.
        this.logger.error(`Applying scheduled change ${row.id} failed: ${String(error)}`);
      }
    }
    if (applied > 0) await this.policy.invalidateCompany(companyId);
    return applied;
  }

  /** The employee, and whoever approves for them in the old and the new branch. Never fails the transfer. */
  private async notify(
    companyId: string,
    before: Employee,
    after: Employee,
    planned: AssignmentValues | null,
    effectiveDate: string,
  ): Promise<void> {
    try {
      const to = planned ?? assignmentValuesOf(after);
      const branchName = async (id: string | null): Promise<string> =>
        id ? ((await this.branches.findById(companyId, id).catch(() => null))?.name ?? "") : "";
      const approvers = new Set<string>();
      for (const branchId of new Set([before.branchId, to.branchId])) {
        for (const id of await this.scope.eligibleUsers(
          companyId,
          PERMISSIONS.LEAVE_APPROVE,
          { employeeId: before.id, branchId },
          before.userId,
        )) {
          approvers.add(id);
        }
      }
      if (before.userId) approvers.add(before.userId);
      if (approvers.size === 0) return;
      const event: NotifyUsersEvent = {
        companyId,
        userIds: [...approvers],
        type: planned ? "employee_transfer_scheduled" : "employee_transferred",
        bodyParams: {
          employeeNameAr: before.fullNameAr,
          employeeNameEn: before.fullNameEn,
          fromBranch: await branchName(before.branchId),
          toBranch: await branchName(to.branchId),
          jobTitle: to.jobTitle,
          effectiveDate,
        },
        entity: "employees",
        entityId: before.id,
        link: `/employees/${before.id}`,
      };
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Transfer notification for ${before.id} failed`, error as Error);
    }
  }
}
