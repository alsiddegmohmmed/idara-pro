import { Inject, Injectable } from "@nestjs/common";
import type { Position } from "@prisma/client";
import type { CreatePosition, PositionView, UpdatePosition } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { DepartmentsService } from "./departments.service";
import { POSITIONS_REPOSITORY, type PositionsRepositoryPort } from "./ports/positions-repository.port";

const toView = (p: Position & { employees?: number }): PositionView => ({
  id: p.id,
  nameAr: p.nameAr,
  nameEn: p.nameEn,
  departmentId: p.departmentId,
  occupationCode: p.occupationCode,
  employees: p.employees ?? 0,
});

/**
 * Job titles as a managed list (ux-redesign-v2 §5): one spelling per job so reports group correctly.
 * An employee's job_title column stays as the snapshot of the position's name (history, exports).
 */
@Injectable()
export class PositionsService {
  constructor(
    @Inject(POSITIONS_REPOSITORY) private readonly repository: PositionsRepositoryPort,
    private readonly departments: DepartmentsService,
    private readonly audit: AuditService,
    private readonly db: TenantDatabase,
  ) {}

  async list(companyId: string): Promise<PositionView[]> {
    return (await this.repository.list(companyId)).map(toView);
  }

  async findById(companyId: string, id: string): Promise<Position> {
    const p = await this.repository.findById(companyId, id);
    if (!p) throw new NotFoundError("Job title not found", "employees.position.not_found");
    return p;
  }

  async create(companyId: string, actorId: string, input: CreatePosition, ip: string | null): Promise<PositionView> {
    if (input.departmentId) await this.departments.findById(companyId, input.departmentId);
    await this.assertNameFree(companyId, input.nameAr);
    const p = await this.repository.create(companyId, { ...input, createdBy: actorId });
    await this.audit.record(companyId, { actorId, action: "create", entity: "positions", entityId: p.id, after: toAuditSnapshot(p), ip });
    return toView(p);
  }

  async update(companyId: string, actorId: string, id: string, input: UpdatePosition, ip: string | null): Promise<PositionView> {
    const before = await this.findById(companyId, id);
    if (input.departmentId) await this.departments.findById(companyId, input.departmentId);
    if (input.nameAr && input.nameAr !== before.nameAr) await this.assertNameFree(companyId, input.nameAr);
    return this.db.transaction(companyId, async () => {
      const after = await this.repository.update(companyId, id, input);
      if (!after) throw new NotFoundError("Job title not found", "employees.position.not_found");
      // A corrected spelling reaches everyone who holds the title.
      if (after.nameAr !== before.nameAr) await this.repository.renameSnapshots(companyId, id, after.nameAr);
      await this.audit.record(companyId, { actorId, action: "update", entity: "positions", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip });
      return toView(after);
    });
  }

  async remove(companyId: string, actorId: string, id: string, ip: string | null): Promise<void> {
    const before = await this.findById(companyId, id);
    if (!(await this.repository.delete(companyId, id))) throw new NotFoundError("Job title not found", "employees.position.not_found");
    await this.audit.record(companyId, { actorId, action: "delete", entity: "positions", entityId: id, before: toAuditSnapshot(before), ip });
  }

  /** The title by its Arabic name, created on the fly (import, "إضافة «…»" in the form). */
  async findOrCreate(companyId: string, actorId: string, nameAr: string, ip: string | null): Promise<Position> {
    const name = nameAr.trim();
    const existing = await this.repository.findByNameAr(companyId, name);
    if (existing) return existing;
    const p = await this.repository.create(companyId, { nameAr: name, createdBy: actorId });
    await this.audit.record(companyId, { actorId, action: "create", entity: "positions", entityId: p.id, after: toAuditSnapshot(p), ip });
    return p;
  }

  private async assertNameFree(companyId: string, nameAr: string): Promise<void> {
    if (await this.repository.findByNameAr(companyId, nameAr.trim())) {
      throw new BusinessRuleError("employees.position.duplicate", "A job title with this name already exists");
    }
  }
}
