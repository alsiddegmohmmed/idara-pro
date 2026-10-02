import { Injectable } from "@nestjs/common";
import type { Position } from "@prisma/client";
import { deleteOrInUse } from "../../../shared/database/in-use";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { PositionData, PositionsRepositoryPort } from "../application/ports/positions-repository.port";

@Injectable()
export class PrismaPositionsRepository implements PositionsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string): Promise<Array<Position & { employees: number }>> {
    const rows = await this.db.withTenant(companyId, (tx) =>
      tx.position.findMany({ where: { companyId }, orderBy: { nameAr: "asc" }, include: { _count: { select: { employees: true } } } }),
    );
    return rows.map(({ _count, ...p }) => ({ ...p, employees: _count.employees }));
  }

  findById(companyId: string, id: string): Promise<Position | null> {
    return this.db.withTenant(companyId, (tx) => tx.position.findFirst({ where: { id, companyId } }));
  }

  findByNameAr(companyId: string, nameAr: string): Promise<Position | null> {
    return this.db.withTenant(companyId, (tx) => tx.position.findFirst({ where: { companyId, nameAr } }));
  }

  create(companyId: string, data: PositionData & { createdBy: string | null }): Promise<Position> {
    return this.db.withTenant(companyId, (tx) => tx.position.create({ data: { companyId, ...data } }));
  }

  update(companyId: string, id: string, data: Partial<PositionData>): Promise<Position | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.position.updateMany({ where: { id, companyId }, data });
      return count === 0 ? null : tx.position.findFirst({ where: { id, companyId } });
    });
  }

  async renameSnapshots(companyId: string, positionId: string, nameAr: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employee.updateMany({ where: { companyId, positionId }, data: { jobTitle: nameAr } }));
  }

  delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await deleteOrInUse(() => tx.position.deleteMany({ where: { id, companyId } }), "employees.position.in_use", "Employees still hold this job title");
      return count > 0;
    });
  }
}
