import type { DataScope } from "../../../shared/access/access-rules";
import { recordScopeWhere } from "../../../shared/access/prisma-scope";
import { Injectable } from "@nestjs/common";
import type { AttendanceCorrection, AttendanceDay, AttendancePunch, Prisma } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  AttendanceRepositoryPort,
  CreatePunchData,
  DaySummaryData,
  DayWithDetail,
} from "../application/ports/attendance-repository.port";

@Injectable()
export class PrismaAttendanceRepository implements AttendanceRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async lockOrCreateDay(companyId: string, employee: { id: string; branchId: string | null }, workDate: Date): Promise<AttendanceDay> {
    this.db.assertInTransaction();
    const employeeId = employee.id;
    return this.db.withTenant(companyId, async (tx) => {
      const day = await tx.attendanceDay.upsert({
        where: { companyId_employeeId_workDate: { companyId, employeeId, workDate } },
        create: { companyId, employeeId, workDate, branchId: employee.branchId },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM attendance_days WHERE id = ${day.id}::uuid FOR UPDATE`;
      // Re-read after the lock: a concurrent transaction may have changed it while we waited.
      return tx.attendanceDay.findUniqueOrThrow({ where: { id: day.id } });
    });
  }

  findDay(companyId: string, employeeId: string, workDate: Date): Promise<AttendanceDay | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.attendanceDay.findUnique({ where: { companyId_employeeId_workDate: { companyId, employeeId, workDate } } }),
    );
  }

  findDayWithDetail(companyId: string, id: string): Promise<DayWithDetail | null> {
    return this.db.withTenant(companyId, (tx) =>
      tx.attendanceDay.findFirst({
        where: { id, companyId },
        include: { punches: { orderBy: { at: "asc" } }, corrections: { orderBy: { createdAt: "asc" } } },
      }),
    );
  }

  acceptedPunches(companyId: string, attendanceDayId: string): Promise<AttendancePunch[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.attendancePunch.findMany({ where: { companyId, attendanceDayId, accepted: true }, orderBy: { at: "asc" } }),
    );
  }

  createPunch(companyId: string, data: CreatePunchData): Promise<AttendancePunch> {
    return this.db.withTenant(companyId, (tx) => tx.attendancePunch.create({ data: { companyId, ...data } }));
  }

  updateDay(companyId: string, id: string, data: DaySummaryData): Promise<AttendanceDay> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.attendanceDay.updateMany({ where: { id, companyId }, data });
      return tx.attendanceDay.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  listDays(companyId: string, filter: { from: Date; to: Date; employeeIds?: string[]; scope?: DataScope; branchId?: string }): Promise<AttendanceDay[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.attendanceDay.findMany({
        where: {
          companyId,
          workDate: { gte: filter.from, lte: filter.to },
          ...(filter.employeeIds ? { employeeId: { in: filter.employeeIds } } : {}),
          ...(filter.scope ? recordScopeWhere(filter.scope) : {}),
          ...(filter.branchId ? { branchId: filter.branchId } : {}),
        },
        orderBy: [{ workDate: "asc" }],
      }),
    );
  }

  createCorrection(
    companyId: string,
    data: { attendanceDayId: string; oldValues: Prisma.InputJsonValue; newValues: Prisma.InputJsonValue; reason: string; correctedBy: string },
  ): Promise<AttendanceCorrection> {
    return this.db.withTenant(companyId, (tx) => tx.attendanceCorrection.create({ data: { companyId, ...data } }));
  }
}
