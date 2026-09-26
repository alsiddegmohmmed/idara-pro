import { Inject, Injectable } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import type { CreateEmployee, UpdateEmployee } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BranchesService, WorkSchedulesService } from "../../company";
import { NotFoundError } from "../../../shared/errors/errors";
import { assertManagerNotSelf, assertValidEmployeeDates } from "../domain/employee-rules";
import { DepartmentsService } from "./departments.service";
import {
  EMPLOYEES_REPOSITORY,
  type EmployeesRepositoryPort,
} from "./ports/employees-repository.port";

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
      createdBy: actorId,
    });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "employees",
      entityId: employee.id,
      after: toAuditSnapshot(employee),
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
      hireDate: input.hireDate ? hireDate : undefined,
      endDate: input.endDate !== undefined ? endDate : undefined,
    });
    if (!after) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "employees",
      entityId: id,
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(after),
      ip,
    });
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
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
