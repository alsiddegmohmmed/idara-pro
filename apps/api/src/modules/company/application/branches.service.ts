import { Inject, Injectable } from "@nestjs/common";
import type { Branch } from "@prisma/client";
import type { CreateBranch, UpdateBranch } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import {
  BRANCHES_REPOSITORY,
  type BranchesRepositoryPort,
} from "./ports/branches-repository.port";

@Injectable()
export class BranchesService {
  constructor(
    @Inject(BRANCHES_REPOSITORY) private readonly repository: BranchesRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string): Promise<Branch[]> {
    return this.repository.list(companyId);
  }

  async findById(companyId: string, id: string): Promise<Branch> {
    const branch = await this.repository.findById(companyId, id);
    if (!branch) throw new NotFoundError("Branch not found", "company.branch.not_found");
    return branch;
  }

  async create(companyId: string, actorId: string, input: CreateBranch, ip: string | null): Promise<Branch> {
    const branch = await this.repository.create(companyId, { ...input, createdBy: actorId });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "branches",
      entityId: branch.id,
      after: toAuditSnapshot(branch),
      ip,
    });
    return branch;
  }

  async update(companyId: string, actorId: string, id: string, input: UpdateBranch, ip: string | null): Promise<Branch> {
    const before = await this.findById(companyId, id);
    const after = await this.repository.update(companyId, id, input);
    if (!after) throw new NotFoundError("Branch not found", "company.branch.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "branches",
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
    if (!deleted) throw new NotFoundError("Branch not found", "company.branch.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "branches",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }
}
