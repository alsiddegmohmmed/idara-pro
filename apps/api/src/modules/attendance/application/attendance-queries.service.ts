import { Inject, Injectable } from "@nestjs/common";
import { PERMISSIONS, type AttendanceStatusCode } from "@idara-pro/shared";
import type { AttendanceDay, Employee } from "@prisma/client";
import { EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { addDays, eachDate, isoDate, workDateOf, type DayKind } from "../../../shared/calendar/work-calendar";
import { toDayDto, toPunchDto, type AttendanceDayDto, type PunchDto } from "./attendance-dto";
import { EmployeeScopeService } from "../../employees";
import { employedOn } from "./close-attendance-days.use-case";
import { CompanyCalendarLoader } from "../../company";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

const MAX_RANGE_DAYS = 93;

export interface EmployeeRef {
  id: string;
  employeeNo: string;
  fullNameAr: string;
  fullNameEn: string;
  jobTitle: string | null;
  branchId: string | null;
}

/** "not_yet" = a working day today with no check-in so far. */
export type BoardState = AttendanceStatusCode | "not_yet";

export interface BoardRow {
  employee: EmployeeRef;
  state: BoardState;
  day: AttendanceDayDto | null;
}

export interface ReportRow {
  employee: EmployeeRef;
  workingDays: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  lateMin: number;
  workedMin: number;
  missingCheckouts: number;
}

export interface ReportDayRow {
  employee: EmployeeRef;
  day: AttendanceDayDto;
}

const toRef = (e: Employee): EmployeeRef => ({
  id: e.id,
  employeeNo: e.employeeNo,
  fullNameAr: e.fullNameAr,
  fullNameEn: e.fullNameEn,
  jobTitle: e.jobTitle,
  branchId: e.branchId,
});

const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function assertRange(from: Date, to: Date): void {
  if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    throw new BusinessRuleError("attendance.range_too_long", `Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  }
}

@Injectable()
export class AttendanceQueriesService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: EmployeeScopeService,
    private readonly calendars: CompanyCalendarLoader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  /** Today for the check-in screen: my day (if any), today's punches and whether today is a working day. */
  async myToday(user: AuthenticatedUser): Promise<{ workDate: string; kind: DayKind; day: AttendanceDayDto | null; punches: PunchDto[] }> {
    const me = await this.me(user);
    const calendar = await this.calendars.load(user.companyId);
    const today = workDateOf(this.clock.now(), calendar.timeZone);
    const day = await this.repository.findDay(user.companyId, me.id, today);
    const detail = day ? await this.repository.findDayWithDetail(user.companyId, day.id) : null;
    return {
      workDate: isoDate(today),
      kind: calendar.kindOf(me, today),
      day: day ? toDayDto(day) : null,
      punches: (detail?.punches ?? []).filter((p) => p.accepted).map(toPunchDto),
    };
  }

  async myDays(user: AuthenticatedUser, fromIso: string, toIso: string): Promise<AttendanceDayDto[]> {
    const me = await this.me(user);
    const from = parseDate(fromIso);
    const to = parseDate(toIso);
    assertRange(from, to);
    const days = await this.repository.listDays(user.companyId, { from, to, employeeIds: [me.id] });
    return days.map(toDayDto);
  }

  async days(
    user: AuthenticatedUser,
    q: { from: string; to: string; employeeId?: string; branchId?: string; status?: AttendanceStatusCode },
  ): Promise<Array<{ employee: EmployeeRef; day: AttendanceDayDto }>> {
    const from = parseDate(q.from);
    const to = parseDate(q.to);
    assertRange(from, to);
    const visible = (await this.scope.visibleEmployees(user, PERMISSIONS.ATTENDANCE_READ)).filter(
      (e) => (!q.employeeId || e.id === q.employeeId) && (!q.branchId || e.branchId === q.branchId),
    );
    if (visible.length === 0) return [];
    const byId = new Map(visible.map((e) => [e.id, e]));
    const days = await this.repository.listDays(user.companyId, { from, to, employeeIds: [...byId.keys()] });
    return days
      .filter((d) => !q.status || d.status === q.status)
      .map((d) => ({ employee: toRef(byId.get(d.employeeId) as Employee), day: toDayDto(d) }));
  }

  async dayDetail(user: AuthenticatedUser, id: string) {
    const day = await this.repository.findDayWithDetail(user.companyId, id);
    if (!day) throw new NotFoundError("Attendance day not found", "attendance.day.not_found");
    const employee = await this.employees.findById(user.companyId, day.employeeId);
    await this.scope.assertCanAccess(user, PERMISSIONS.ATTENDANCE_READ, employee, "attendance.out_of_scope");
    return {
      employee: toRef(employee),
      day: toDayDto(day),
      punches: day.punches.map(toPunchDto),
      corrections: day.corrections.map((c) => ({
        id: c.id,
        oldValues: c.oldValues,
        newValues: c.newValues,
        reason: c.reason,
        correctedBy: c.correctedBy,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  /** Who is in today (or on `date`): one row per visible employee employed that day. */
  async board(user: AuthenticatedUser, dateIso?: string, branchId?: string): Promise<{ workDate: string; rows: BoardRow[] }> {
    const calendar = await this.calendars.load(user.companyId);
    const today = workDateOf(this.clock.now(), calendar.timeZone);
    const date = dateIso ? parseDate(dateIso) : today;
    const visible = (await this.scope.visibleEmployees(user, PERMISSIONS.ATTENDANCE_READ)).filter(
      (e) => employedOn(e, date) && (!branchId || e.branchId === branchId),
    );
    const days = visible.length
      ? await this.repository.listDays(user.companyId, { from: date, to: date, employeeIds: visible.map((e) => e.id) })
      : [];
    const byEmployee = new Map(days.map((d) => [d.employeeId, d]));
    const rows = visible.map((e): BoardRow => {
      const day = byEmployee.get(e.id) ?? null;
      const kind = calendar.kindOf(e, date);
      let state: BoardState;
      if (day?.status) state = day.status;
      else if (kind !== "working") state = kind;
      else state = date.getTime() >= today.getTime() ? "not_yet" : "absent";
      return { employee: toRef(e), state, day: day ? toDayDto(day) : null };
    });
    return { workDate: isoDate(date), rows };
  }

  /** Monthly summary per employee, counting working days up to today (future days aren't judged). */
  async report(
    user: AuthenticatedUser,
    month: string,
    branchId?: string,
  ): Promise<{ month: string; rows: ReportRow[]; days: ReportDayRow[] }> {
    const calendar = await this.calendars.load(user.companyId);
    const today = workDateOf(this.clock.now(), calendar.timeZone);
    const from = parseDate(`${month}-01`);
    const monthEnd = addDays(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)), -1);
    const to = monthEnd.getTime() < today.getTime() ? monthEnd : today;
    const visible = (await this.scope.visibleEmployees(user, PERMISSIONS.ATTENDANCE_READ)).filter(
      (e) => !branchId || e.branchId === branchId,
    );
    if (visible.length === 0 || to.getTime() < from.getTime()) return { month, rows: [], days: [] };
    const days = await this.repository.listDays(user.companyId, { from, to, employeeIds: visible.map((e) => e.id) });
    const byEmployee = new Map<string, AttendanceDay[]>();
    for (const d of days) byEmployee.set(d.employeeId, [...(byEmployee.get(d.employeeId) ?? []), d]);
    const dates = eachDate(from, to);
    const count = (list: AttendanceDay[], status: AttendanceStatusCode): number => list.filter((d) => d.status === status).length;

    const rows = visible
      .map((e): ReportRow => {
        const list = byEmployee.get(e.id) ?? [];
        return {
          employee: toRef(e),
          workingDays: dates.filter((d) => employedOn(e, d) && calendar.kindOf(e, d) === "working").length,
          present: count(list, "present"),
          late: count(list, "late"),
          absent: count(list, "absent"),
          leave: count(list, "leave"),
          lateMin: list.reduce((sum, d) => sum + d.lateMin, 0),
          workedMin: list.reduce((sum, d) => sum + d.workedMin, 0),
          missingCheckouts: list.filter((d) => d.missingCheckout).length,
        };
      })
      .filter((r) => r.workingDays > 0 || r.present + r.late + r.absent + r.leave > 0);
    const refs = new Map(visible.map((e) => [e.id, toRef(e)]));
    return {
      month,
      rows,
      days: days.map((d) => ({ employee: refs.get(d.employeeId) as EmployeeRef, day: toDayDto(d) })),
    };
  }
}
