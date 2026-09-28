import { Injectable } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import { BranchesService, CompaniesService, HolidaysService, WorkSchedulesService } from "../../company";
import { dayKind, isoDate, type DayKind, type ScheduleTimes } from "../domain/work-calendar";

/** Everything needed to judge any employee's day in one company, loaded once per request/job. */
export class CompanyCalendar {
  constructor(
    readonly timeZone: string,
    private readonly weekendDays: number[],
    private readonly holidays: ReadonlySet<string>,
    private readonly schedules: ReadonlyMap<string, ScheduleTimes>,
    private readonly branchDefaultSchedule: ReadonlyMap<string, string | null>,
  ) {}

  /** Schedule priority (business-rules.md): employee → branch default → none (company default not modelled yet). */
  scheduleFor(employee: Pick<Employee, "scheduleId" | "branchId">): ScheduleTimes | null {
    const id = employee.scheduleId ?? (employee.branchId ? this.branchDefaultSchedule.get(employee.branchId) : null) ?? null;
    return id ? (this.schedules.get(id) ?? null) : null;
  }

  kindOf(employee: Pick<Employee, "scheduleId" | "branchId">, workDate: Date): DayKind {
    return dayKind(workDate, this.weekendDays, this.holidays, this.scheduleFor(employee));
  }
}

@Injectable()
export class CompanyCalendarLoader {
  constructor(
    private readonly companies: CompaniesService,
    private readonly holidays: HolidaysService,
    private readonly schedules: WorkSchedulesService,
    private readonly branches: BranchesService,
  ) {}

  async load(companyId: string): Promise<CompanyCalendar> {
    const [company, holidays, schedules, branches] = await Promise.all([
      this.companies.findById(companyId),
      this.holidays.list(companyId),
      this.schedules.list(companyId),
      this.branches.list(companyId),
    ]);
    return new CompanyCalendar(
      company.timezone,
      company.weekendDays,
      new Set(holidays.map((h) => isoDate(h.date))),
      new Map(schedules.map((s) => [s.id, s])),
      new Map(branches.map((b) => [b.id, b.defaultScheduleId])),
    );
  }
}
