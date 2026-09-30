import { Inject, Injectable } from "@nestjs/common";
import type { Employee, EmployeeAssignment } from "@prisma/client";
import type { AssignmentView } from "@idara-pro/shared";
import {
  dayBefore,
  planChange,
  sameAssignment,
  type AssignmentValues,
} from "../domain/assignment-rules";
import {
  ASSIGNMENTS_REPOSITORY,
  type AssignmentsRepositoryPort,
  type CreateAssignmentData,
} from "./ports/assignments-repository.port";

export const assignmentValuesOf = (e: AssignmentValues): AssignmentValues => ({
  branchId: e.branchId,
  departmentId: e.departmentId,
  jobTitle: e.jobTitle,
  managerId: e.managerId,
  scheduleId: e.scheduleId,
});

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toAssignmentView(a: EmployeeAssignment): AssignmentView {
  return {
    id: a.id,
    kind: a.kind as AssignmentView["kind"],
    branchId: a.branchId,
    departmentId: a.departmentId,
    jobTitle: a.jobTitle,
    managerId: a.managerId,
    scheduleId: a.scheduleId,
    validFrom: iso(a.validFrom) as string,
    validTo: iso(a.validTo),
    scheduled: a.appliedAt === null,
    reason: a.reason,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Career history (ADR-0012): keeps `employee_assignments` in step with the current values on `employees`.
 * Every method runs inside the caller's transaction, after the employee row is locked.
 */
@Injectable()
export class EmployeeAssignmentsService {
  constructor(
    @Inject(ASSIGNMENTS_REPOSITORY) private readonly repository: AssignmentsRepositoryPort,
  ) {}

  async list(companyId: string, employeeId: string): Promise<AssignmentView[]> {
    return (await this.repository.listByEmployee(companyId, employeeId)).map(toAssignmentView);
  }

  findScheduled(companyId: string, employeeId: string): Promise<EmployeeAssignment | null> {
    return this.repository.findScheduled(companyId, employeeId);
  }

  async recordHire(
    companyId: string,
    employee: Employee,
    actorId: string | null,
    now: Date,
  ): Promise<void> {
    await this.repository.create(companyId, {
      employeeId: employee.id,
      kind: "hire",
      ...assignmentValuesOf(employee),
      validFrom: employee.hireDate,
      appliedAt: now,
      reason: null,
      createdBy: actorId,
    });
  }

  /** An edit of the employee record that touched tracked fields: a "change" effective today. */
  async recordEdit(
    companyId: string,
    before: Employee,
    after: Employee,
    today: Date,
    actorId: string,
    now: Date,
  ): Promise<void> {
    if (sameAssignment(assignmentValuesOf(before), assignmentValuesOf(after))) return;
    await this.apply(
      companyId,
      after.id,
      assignmentValuesOf(after),
      today,
      "change",
      null,
      actorId,
      now,
    );
  }

  /**
   * Puts `values` on the timeline from `effective`: closes the current period the day before (or corrects
   * it in place when it started that same day). The caller updates `employees` to the same values.
   */
  async apply(
    companyId: string,
    employeeId: string,
    values: AssignmentValues,
    effective: Date,
    kind: CreateAssignmentData["kind"],
    reason: string | null,
    actorId: string | null,
    now: Date,
  ): Promise<void> {
    const current = await this.repository.findCurrent(companyId, employeeId);
    if (current && planChange(current.validFrom, effective) === "replace") {
      await this.repository.replace(companyId, current.id, {
        ...values,
        kind: current.kind === "hire" ? "hire" : kind,
        reason,
      });
      return;
    }
    if (current) await this.repository.close(companyId, current.id, dayBefore(effective));
    await this.repository.create(companyId, {
      employeeId,
      kind,
      ...values,
      validFrom: effective,
      appliedAt: now,
      reason,
      createdBy: actorId,
    });
  }

  /** Validates that a future change fits after the current period, then stores it (replacing any earlier plan). */
  async schedule(
    companyId: string,
    employeeId: string,
    values: AssignmentValues,
    effective: Date,
    reason: string,
    actorId: string,
  ): Promise<EmployeeAssignment> {
    const current = await this.repository.findCurrent(companyId, employeeId);
    if (current) planChange(current.validFrom, effective);
    await this.repository.deleteScheduled(companyId, employeeId);
    return this.repository.create(companyId, {
      employeeId,
      kind: "transfer",
      ...values,
      validFrom: effective,
      appliedAt: null,
      reason,
      createdBy: actorId,
    });
  }

  cancelScheduled(companyId: string, employeeId: string): Promise<EmployeeAssignment | null> {
    return this.repository.deleteScheduled(companyId, employeeId);
  }

  listDue(companyId: string, today: Date): Promise<EmployeeAssignment[]> {
    return this.repository.listDue(companyId, today);
  }

  /** The nightly job applying a scheduled row: the row itself becomes the current period. */
  async applyScheduled(companyId: string, row: EmployeeAssignment, now: Date): Promise<void> {
    const current = await this.repository.findCurrent(companyId, row.employeeId);
    if (current) {
      if (planChange(current.validFrom, row.validFrom) === "replace") {
        await this.repository.replace(companyId, current.id, {
          ...assignmentValuesOf(row),
          kind: "transfer",
          reason: row.reason,
        });
        await this.repository.deleteScheduled(companyId, row.employeeId);
        return;
      }
      await this.repository.close(companyId, current.id, dayBefore(row.validFrom));
    }
    await this.repository.markApplied(companyId, row.id, now);
  }
}
