import { Inject, Injectable } from "@nestjs/common";
import type { SalaryComponent } from "@prisma/client";
import type { CreateSalaryComponent, UpdateSalaryComponent } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import { dateRangesOverlap } from "../domain/employee-rules";
import { EmployeesService } from "./employees.service";
import {
  SALARY_COMPONENTS_REPOSITORY,
  type SalaryComponentsRepositoryPort,
} from "./ports/salary-components-repository.port";

@Injectable()
export class SalaryComponentsService {
  constructor(
    @Inject(SALARY_COMPONENTS_REPOSITORY) private readonly repository: SalaryComponentsRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
  ) {}

  async listByEmployee(companyId: string, employeeId: string): Promise<SalaryComponent[]> {
    await this.employees.findById(companyId, employeeId); // 404s if not this company's employee
    return this.repository.listByEmployee(companyId, employeeId);
  }

  async findById(companyId: string, id: string): Promise<SalaryComponent> {
    const component = await this.repository.findById(companyId, id);
    if (!component) throw new NotFoundError("Salary component not found", "employees.salary_component.not_found");
    return component;
  }

  private async assertNoOverlap(
    companyId: string,
    employeeId: string,
    type: SalaryComponent["type"],
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.repository.listByEmployeeAndType(companyId, employeeId, type);
    for (const component of existing) {
      if (component.id === excludeId) continue;
      if (dateRangesOverlap(effectiveFrom, effectiveTo, component.effectiveFrom, component.effectiveTo)) {
        throw new BusinessRuleError(
          "employees.salary_component.overlapping_range",
          `Employee already has a "${type}" component effective in this date range`,
        );
      }
    }
  }

  async create(
    companyId: string,
    actorId: string,
    employeeId: string,
    input: CreateSalaryComponent,
    ip: string | null,
  ): Promise<SalaryComponent> {
    await this.employees.findById(companyId, employeeId);

    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    await this.assertNoOverlap(companyId, employeeId, input.type, effectiveFrom, effectiveTo);

    const component = await this.repository.create(companyId, {
      employeeId,
      type: input.type,
      amountHalalas: BigInt(input.amountHalalas),
      effectiveFrom,
      effectiveTo,
      createdBy: actorId,
    });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "salary_components",
      entityId: component.id,
      after: toAuditSnapshot(component),
      ip,
    });
    return component;
  }

  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateSalaryComponent,
    ip: string | null,
  ): Promise<SalaryComponent> {
    const before = await this.findById(companyId, id);
    const type = input.type ?? before.type;
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : before.effectiveFrom;
    const effectiveTo =
      input.effectiveTo !== undefined ? (input.effectiveTo ? new Date(input.effectiveTo) : null) : before.effectiveTo;
    await this.assertNoOverlap(companyId, before.employeeId, type, effectiveFrom, effectiveTo, id);

    const after = await this.repository.update(companyId, id, {
      type: input.type,
      amountHalalas: input.amountHalalas !== undefined ? BigInt(input.amountHalalas) : undefined,
      effectiveFrom: input.effectiveFrom ? effectiveFrom : undefined,
      effectiveTo: input.effectiveTo !== undefined ? effectiveTo : undefined,
    });
    if (!after) throw new NotFoundError("Salary component not found", "employees.salary_component.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "salary_components",
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
    if (!deleted) throw new NotFoundError("Salary component not found", "employees.salary_component.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "salary_components",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
