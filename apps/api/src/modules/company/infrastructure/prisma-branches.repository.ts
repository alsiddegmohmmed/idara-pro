import { Injectable } from "@nestjs/common";
import type { Branch } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  BranchesRepositoryPort,
  CreateBranchData,
  UpdateBranchData,
} from "../application/ports/branches-repository.port";

@Injectable()
export class PrismaBranchesRepository implements BranchesRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<Branch[]> {
    return this.db.withTenant(companyId, (tx) => tx.branch.findMany({ where: { companyId } }));
  }

  async findById(companyId: string, id: string): Promise<Branch | null> {
    return this.db.withTenant(companyId, (tx) => tx.branch.findFirst({ where: { id, companyId } }));
  }

  async create(companyId: string, data: CreateBranchData): Promise<Branch> {
    return this.db.withTenant(companyId, (tx) => tx.branch.create({ data: { companyId, ...data } }));
  }

  async update(companyId: string, id: string, data: UpdateBranchData): Promise<Branch | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.branch.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.branch.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.branch.deleteMany({ where: { id, companyId } });
      return count > 0;
    });
  }
}
