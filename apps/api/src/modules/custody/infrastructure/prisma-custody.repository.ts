import { Injectable } from "@nestjs/common";
import type { CustodyRequest, CustodyStatus, Prisma } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { CustodyRepositoryPort } from "../application/ports/custody-repository.port";

@Injectable()
export class PrismaCustodyRepository implements CustodyRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  create(companyId: string, data: { employeeId: string; amountHalalas: bigint; purpose: string; createdBy: string }): Promise<CustodyRequest> {
    return this.db.withTenant(companyId, (tx) => tx.custodyRequest.create({ data: { companyId, ...data } }));
  }

  async lockById(companyId: string, id: string): Promise<CustodyRequest | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM custody_requests WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return tx.custodyRequest.findFirst({ where: { id, companyId } });
    });
  }

  update(companyId: string, id: string, data: Prisma.CustodyRequestUncheckedUpdateManyInput): Promise<CustodyRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.custodyRequest.updateMany({ where: { id, companyId }, data });
      return tx.custodyRequest.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  list(companyId: string, filter: { employeeIds?: string[]; status?: CustodyStatus }): Promise<CustodyRequest[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.custodyRequest.findMany({
        where: {
          companyId,
          ...(filter.employeeIds ? { employeeId: { in: filter.employeeIds } } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  listPaidBetween(companyId: string, from: Date, to: Date): Promise<CustodyRequest[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.custodyRequest.findMany({
        where: { companyId, paidAt: { gte: from, lt: to }, status: { in: ["paid", "settled"] } },
        orderBy: { paidAt: "asc" },
      }),
    );
  }
}
