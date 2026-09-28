import { Injectable } from "@nestjs/common";
import type { LeaveBalance, LeaveRequest, LeaveRequestStatus, LeaveType } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { LeaveRepositoryPort, LeaveRequestWithType } from "../application/ports/leave-repository.port";

const withType = { leaveType: true } as const;

@Injectable()
export class PrismaLeaveRepository implements LeaveRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  listTypes(companyId: string, activeOnly: boolean): Promise<LeaveType[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveType.findMany({ where: { companyId, ...(activeOnly ? { active: true } : {}) }, orderBy: { createdAt: "asc" } }),
    );
  }

  findType(companyId: string, id: string): Promise<LeaveType | null> {
    return this.db.withTenant(companyId, (tx) => tx.leaveType.findFirst({ where: { id, companyId } }));
  }

  async lockEmployee(companyId: string, employeeId: string): Promise<void> {
    this.db.assertInTransaction();
    await this.db.withTenant(companyId, (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${employeeId}`}))`);
  }

  findOverlapping(companyId: string, employeeId: string, start: Date, end: Date, excludeId?: string): Promise<LeaveRequest[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveRequest.findMany({
        where: {
          companyId,
          employeeId,
          status: { in: ["pending", "approved"] },
          startDate: { lte: end },
          endDate: { gte: start },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      }),
    );
  }

  findBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveBalance.findUnique({ where: { companyId_employeeId_leaveTypeId_year: { companyId, employeeId, leaveTypeId, year } } }),
    );
  }

  getOrCreateBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number, entitledDays: number): Promise<LeaveBalance> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveBalance.upsert({
        where: { companyId_employeeId_leaveTypeId_year: { companyId, employeeId, leaveTypeId, year } },
        create: { companyId, employeeId, leaveTypeId, year, entitledDays },
        update: {},
      }),
    );
  }

  listBalances(companyId: string, filter: { year: number; employeeIds?: string[] }): Promise<LeaveBalance[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveBalance.findMany({
        where: { companyId, year: filter.year, ...(filter.employeeIds ? { employeeId: { in: filter.employeeIds } } : {}) },
      }),
    );
  }

  setEntitlement(companyId: string, id: string, entitledDays: number): Promise<LeaveBalance> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.leaveBalance.updateMany({ where: { id, companyId }, data: { entitledDays } });
      return tx.leaveBalance.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  addUsedDays(companyId: string, id: string, days: number): Promise<LeaveBalance> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.leaveBalance.updateMany({ where: { id, companyId }, data: { usedDays: { increment: days } } });
      return tx.leaveBalance.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  async sumPendingDays(companyId: string, employeeId: string, leaveTypeId: string, year: number, excludeId?: string): Promise<number> {
    const result = await this.db.withTenant(companyId, (tx) =>
      tx.leaveRequest.aggregate({
        _sum: { days: true },
        where: {
          companyId,
          employeeId,
          leaveTypeId,
          status: "pending",
          startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      }),
    );
    return result._sum.days ?? 0;
  }

  create(
    companyId: string,
    data: { employeeId: string; leaveTypeId: string; startDate: Date; endDate: Date; days: number; reason: string | null; createdBy: string },
  ): Promise<LeaveRequestWithType> {
    return this.db.withTenant(companyId, (tx) => tx.leaveRequest.create({ data: { companyId, ...data }, include: withType }));
  }

  findById(companyId: string, id: string): Promise<LeaveRequestWithType | null> {
    return this.db.withTenant(companyId, (tx) => tx.leaveRequest.findFirst({ where: { id, companyId }, include: withType }));
  }

  async lockById(companyId: string, id: string): Promise<LeaveRequestWithType | null> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
      return tx.leaveRequest.findFirst({ where: { id, companyId }, include: withType });
    });
  }

  decide(
    companyId: string,
    id: string,
    data: { status: LeaveRequestStatus; decidedBy: string | null; decidedAt: Date; decisionNote: string | null },
  ): Promise<LeaveRequestWithType> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.leaveRequest.updateMany({ where: { id, companyId }, data });
      return tx.leaveRequest.findFirstOrThrow({ where: { id, companyId }, include: withType });
    });
  }

  list(
    companyId: string,
    filter: { employeeIds?: string[]; status?: LeaveRequestStatus; from?: Date; to?: Date },
  ): Promise<LeaveRequestWithType[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.leaveRequest.findMany({
        where: {
          companyId,
          ...(filter.employeeIds ? { employeeId: { in: filter.employeeIds } } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.to ? { startDate: { lte: filter.to } } : {}),
          ...(filter.from ? { endDate: { gte: filter.from } } : {}),
        },
        include: withType,
        orderBy: [{ startDate: "desc" }],
      }),
    );
  }
}
