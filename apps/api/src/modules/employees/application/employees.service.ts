import { Inject, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee } from "@prisma/client";
import type { CreateEmployee, UpdateEmployee } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BranchesService, WorkSchedulesService } from "../../company";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { maskIban } from "@idara-pro/shared";
import { assertManagerNotSelf, assertValidEmployeeDates } from "../domain/employee-rules";
import { DepartmentsService } from "./departments.service";
import {
  EMPLOYEES_REPOSITORY,
  type EmployeesRepositoryPort,
} from "./ports/employees-repository.port";

/** Audit entries never carry a full IBAN — masked like everywhere else it isn't needed in full. */
function employeeAuditSnapshot(employee: Employee): Record<string, unknown> {
  return { ...toAuditSnapshot(employee), iban: maskIban(employee.iban), pendingIban: maskIban(employee.pendingIban) };
}

/** Payload of "employee.deactivated" — the auth module listens (no import either way) and cuts off
 * the linked user's access. Emitted on every save that sets status=inactive, so a retry after a
 * partial failure still completes the job. */
export interface EmployeeDeactivatedEvent {
  companyId: string;
  employeeId: string;
  /** Null when the employee never got an account (an outstanding invitation is still cancelled). */
  userId: string | null;
  actorId: string;
  ip: string | null;
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
  ) {}

  list(companyId: string): Promise<Employee[]> {
    return this.repository.list(companyId);
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
    return employee;
  }

  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateEmployee,
    ip: string | null,
  ): Promise<Employee> {
    const before = await this.findById(companyId, id);
    // Four eyes: nobody sets their own payroll IBAN directly (they submit it for review instead).
    if (input.iban !== undefined && before.userId === actorId) {
      throw new ForbiddenError("You cannot set your own IBAN directly", "employees.review.own_submission");
    }
    assertManagerNotSelf(id, input.managerId);
    await this.assertReferencesBelongToCompany(companyId, input);

    const hireDate = input.hireDate ? new Date(input.hireDate) : before.hireDate;
    const endDate = input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : before.endDate;
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
      endDate: input.endDate !== undefined ? endDate : undefined,
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
    if (input.status === "inactive") {
      // The listener does not swallow errors (suppressErrors:false), so if cutting off access
      // fails HR gets an error and can save again — this fires on every inactive save.
      await this.emitDeactivated(companyId, id, after.userId, actorId, ip);
    }
    return after;
  }

  async remove(companyId: string, actorId: string, id: string, ip: string | null): Promise<void> {
    const before = await this.findById(companyId, id);
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
    } satisfies EmployeeDeactivatedEvent);
  }
}
