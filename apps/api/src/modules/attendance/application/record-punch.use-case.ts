import { Inject, Injectable } from "@nestjs/common";
import { COMPANY_SETTING_KEYS, type CreatePunch } from "@idara-pro/shared";
import type { Employee } from "@prisma/client";
import { BranchesService, CompanySettingsService } from "../../company";
import { EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import { hashRequest, IdempotencyService } from "../../../shared/idempotency/idempotency.service";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { summarizeDay } from "../domain/day-summary";
import { DEFAULT_MAX_GPS_ACCURACY_M, evaluatePunchLocation, punchSequenceError } from "../domain/punch-rules";
import { workDateOf } from "../../../shared/calendar/work-calendar";
import { toDayDto, toPunchDto, type AttendanceDayDto, type PunchDto } from "./attendance-dto";
import { CompanyCalendarLoader, type CompanyCalendar } from "../../company";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

interface PunchContext {
  employee: Employee;
  now: Date;
  workDate: Date;
  calendar: CompanyCalendar;
  distanceM: number;
}

export interface PunchResult {
  punch: PunchDto;
  day: AttendanceDayDto;
}

/**
 * Check-in/out (business-rules.md "Attendance"). The server — never the phone — decides whether the
 * position is inside the branch radius with acceptable GPS accuracy; both check-in and check-out are
 * checked. A rejected punch is kept for the record but never counts, and the caller gets a clear error.
 */
@Injectable()
export class RecordPunchUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly branches: BranchesService,
    private readonly settings: CompanySettingsService,
    private readonly calendars: CompanyCalendarLoader,
    private readonly idempotency: IdempotencyService,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(user: AuthenticatedUser, input: CreatePunch, idempotencyKey: string | undefined): Promise<PunchResult> {
    // Location is judged (and a rejection recorded) outside the idempotent transaction, so a rejected
    // attempt is kept even when the request carries an Idempotency-Key.
    const context = await this.judge(user, input);
    const accept = (): Promise<PunchResult> => this.accept(user.companyId, input, context);
    if (!idempotencyKey) return accept();
    return this.idempotency.run(user.companyId, user.userId, "attendance.punch", idempotencyKey, hashRequest(input), accept);
  }

  private async judge(user: AuthenticatedUser, input: CreatePunch): Promise<PunchContext> {
    const { companyId } = user;
    const employee = await this.employees.findByUserId(companyId, user.userId);
    if (!employee) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    if (employee.status !== "active") throw new BusinessRuleError("attendance.employee_inactive", "Inactive employees cannot punch");
    // Field staff without a fixed branch: policy TBD (business-rules.md) — refused until decided.
    if (!employee.branchId) throw new BusinessRuleError("attendance.no_branch", "No branch is assigned to this employee");

    const now = this.clock.now();
    const calendar = await this.calendars.load(companyId);
    const workDate = workDateOf(now, calendar.timeZone);
    const branch = await this.branches.findById(companyId, employee.branchId);
    const maxAccuracyM = await this.settings.getNumber(
      companyId,
      COMPANY_SETTING_KEYS.MAX_GPS_ACCURACY_M,
      workDate,
      DEFAULT_MAX_GPS_ACCURACY_M,
    );
    const evaluation = evaluatePunchLocation(input, branch, maxAccuracyM);
    if (!evaluation.accepted) {
      await this.repository.createPunch(companyId, this.punchData(employee, input, now, evaluation.distanceM, null, evaluation.rejectReason));
      throw new BusinessRuleError(`attendance.punch.${evaluation.rejectReason}`, "Punch rejected", {
        distanceM: Math.round(evaluation.distanceM),
        radiusM: branch.radiusM,
        accuracyM: Math.round(input.accuracyM),
        maxAccuracyM,
      });
    }
    return { employee, now, workDate, calendar, distanceM: evaluation.distanceM };
  }

  private accept(companyId: string, input: CreatePunch, ctx: PunchContext): Promise<PunchResult> {
    const { employee, now, workDate, calendar } = ctx;
    return this.db.transaction(companyId, async () => {
      const day = await this.repository.lockOrCreateDay(companyId, employee.id, workDate);
      const punches = await this.repository.acceptedPunches(companyId, day.id);
      const sequenceError = punchSequenceError(punches.at(-1)?.kind ?? null, input.kind);
      if (sequenceError) throw new BusinessRuleError(`attendance.punch.${sequenceError}`, "Punch out of sequence");

      const punch = await this.repository.createPunch(companyId, this.punchData(employee, input, now, ctx.distanceM, day.id, null));
      // A corrected day or an approved-leave day keeps its figures; the punch is still recorded.
      const updated = day.corrected || day.status === "leave"
        ? day
        : await this.repository.updateDay(
            companyId,
            day.id,
            summarizeDay({
              punches: [...punches, punch],
              workDate,
              kind: calendar.kindOf(employee, workDate),
              schedule: calendar.scheduleFor(employee),
              timeZone: calendar.timeZone,
              closed: false,
            }),
          );
      return { punch: toPunchDto(punch), day: toDayDto(updated) };
    });
  }

  private punchData(
    employee: Employee,
    input: CreatePunch,
    at: Date,
    distanceM: number,
    attendanceDayId: string | null,
    rejectReason: string | null,
  ): Parameters<AttendanceRepositoryPort["createPunch"]>[1] {
    return {
      employeeId: employee.id,
      attendanceDayId,
      kind: input.kind,
      at,
      lat: input.lat,
      lng: input.lng,
      accuracyM: input.accuracyM,
      distanceM,
      accepted: rejectReason === null,
      rejectReason,
      deviceInfo: input.deviceInfo ?? null,
    };
  }
}
