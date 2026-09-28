import { Inject, Injectable } from "@nestjs/common";
import { PERMISSIONS, type CorrectAttendance } from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError } from "../../../shared/errors/errors";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { summarizeDay, type PunchTime } from "../domain/day-summary";
import { workDateOf } from "../domain/work-calendar";
import { toDayDto, type AttendanceDayDto } from "./attendance-dto";
import { AttendanceScope } from "./attendance-scope";
import { CompanyCalendarLoader } from "./company-calendar";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

/**
 * Manager/HR correction (business-rules.md): sets a day's check-in/out and/or status with a mandatory
 * reason, within the corrector's scope (HR = company, manager = team). Nobody corrects their own day.
 * Stored as an attendance_corrections row (old → new) and audited; the day is marked `corrected` so the
 * nightly job and later punches never overwrite it.
 */
@Injectable()
export class CorrectAttendanceUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: AttendanceScope,
    private readonly calendars: CompanyCalendarLoader,
    private readonly audit: AuditService,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(user: AuthenticatedUser, input: CorrectAttendance, ip: string | null): Promise<AttendanceDayDto> {
    const { companyId } = user;
    const employee = await this.employees.findById(companyId, input.employeeId);
    if (employee.userId === user.userId) {
      throw new ForbiddenError("You cannot correct your own attendance", "attendance.correction.own");
    }
    await this.scope.assertCanAccess(user, PERMISSIONS.ATTENDANCE_CORRECT, employee);

    const calendar = await this.calendars.load(companyId);
    const today = workDateOf(this.clock.now(), calendar.timeZone);
    const workDate = new Date(`${input.workDate}T00:00:00.000Z`);
    if (workDate.getTime() > today.getTime()) {
      throw new BusinessRuleError("attendance.correction.future_date", "Cannot correct a future day");
    }

    return this.db.transaction(companyId, async () => {
      const day = await this.repository.lockOrCreateDay(companyId, employee.id, workDate);
      const firstInAt = input.firstInAt === undefined ? day.firstInAt : input.firstInAt === null ? null : new Date(input.firstInAt);
      const lastOutAt = input.lastOutAt === undefined ? day.lastOutAt : input.lastOutAt === null ? null : new Date(input.lastOutAt);
      for (const instant of [firstInAt, lastOutAt]) {
        if (instant && workDateOf(instant, calendar.timeZone).getTime() !== workDate.getTime()) {
          throw new BusinessRuleError("attendance.correction.time_outside_day", "Times must fall on the corrected work date");
        }
      }
      if (!firstInAt && lastOutAt) {
        throw new BusinessRuleError("attendance.correction.checkout_without_checkin", "A check-out needs a check-in");
      }
      if (firstInAt && lastOutAt && lastOutAt.getTime() <= firstInAt.getTime()) {
        throw new BusinessRuleError("attendance.correction.invalid_times", "Check-out must be after check-in");
      }

      const punches: PunchTime[] = [
        ...(firstInAt ? [{ kind: "in" as const, at: firstInAt }] : []),
        ...(lastOutAt ? [{ kind: "out" as const, at: lastOutAt }] : []),
      ];
      const derived = summarizeDay({
        punches,
        workDate,
        kind: calendar.kindOf(employee, workDate),
        schedule: calendar.scheduleFor(employee),
        timeZone: calendar.timeZone,
        closed: workDate.getTime() < today.getTime(),
      });
      const before = toDayDto(day);
      const after = await this.repository.updateDay(companyId, day.id, {
        ...derived,
        status: input.status ?? derived.status,
        corrected: true,
      });
      const afterDto = toDayDto(after);
      const changed = { status: afterDto.status, firstInAt: afterDto.firstInAt, lastOutAt: afterDto.lastOutAt, lateMin: afterDto.lateMin };
      const previous = { status: before.status, firstInAt: before.firstInAt, lastOutAt: before.lastOutAt, lateMin: before.lateMin };
      await this.repository.createCorrection(companyId, {
        attendanceDayId: day.id,
        oldValues: previous,
        newValues: changed,
        reason: input.reason,
        correctedBy: user.userId,
      });
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "correct",
        entity: "attendance_days",
        entityId: day.id,
        before: { ...previous, employeeId: employee.id, workDate: before.workDate },
        after: { ...changed, employeeId: employee.id, workDate: before.workDate, reason: input.reason },
        ip,
      });
      return afterDto;
    });
  }
}
