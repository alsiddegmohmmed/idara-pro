import { Inject, Injectable } from "@nestjs/common";
import type { Department } from "@prisma/client";
import type { CreateDepartment, UpdateDepartment } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { assertParentNotSelf } from "../domain/employee-rules";
import {
  DEPARTMENTS_REPOSITORY,
  type DepartmentsRepositoryPort,
} from "./ports/departments-repository.port";

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: DepartmentsRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string): Promise<Department[]> {
    return this.repository.list(companyId);
  }

  async findById(companyId: string, id: string): Promise<Department> {
    const department = await this.repository.findById(companyId, id);
    if (!department) throw new NotFoundError("Department not found", "employees.department.not_found");
    return department;
  }

  /** Throws NotFoundError if parentId is set but doesn't belong to companyId —
   * the tenant-safety check a raw FK alone can't provide (see the employees
   * module's plan notes: Department.id is globally, not per-company, unique). */
  private async assertParentBelongsToCompany(companyId: string, parentId: string | null | undefined): Promise<void> {
    if (parentId) await this.findById(companyId, parentId);
  }

  async create(
    companyId: string,
    actorId: string,
    input: CreateDepartment,
    ip: string | null,
  ): Promise<Department> {
    await this.assertParentBelongsToCompany(companyId, input.parentId);

    const department = await this.repository.create(companyId, { ...input, createdBy: actorId });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "departments",
      entityId: department.id,
      after: toAuditSnapshot(department),
      ip,
    });
    return department;
  }

  async update(
    companyId: string,
    actorId: string,
    id: string,
    input: UpdateDepartment,
    ip: string | null,
  ): Promise<Department> {
    const before = await this.findById(companyId, id);
    assertParentNotSelf(id, input.parentId);
    await this.assertParentBelongsToCompany(companyId, input.parentId);

    const after = await this.repository.update(companyId, id, input);
    if (!after) throw new NotFoundError("Department not found", "employees.department.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "departments",
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
    if (!deleted) throw new NotFoundError("Department not found", "employees.department.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "departments",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
