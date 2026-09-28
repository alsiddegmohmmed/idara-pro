import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import { EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { summarizeDay } from "../domain/day-summary";
import { addDays, isoDate, workDateOf } from "../domain/work-calendar";
import { CompanyCalendarLoader, type CompanyCalendar } from "./company-calendar";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

/** Employed on that date: active, hired on or before it, not ended before it. */
export function employedOn(e: Employee, workDate: Date): boolean {
  return (
    e.status === "active" && e.hireDate.getTime() <= workDate.getTime() && (!e.endDate || e.endDate.getTime() >= workDate.getTime())
  );
}

/**
 * Nightly job (business-rules.md "Attendance"): once a work day is over in the company time zone,
 * every employee gets a closed day row — working days with no punch become `absent`, a check-in with
 * no check-out is flagged `missing_checkout`, weekends/holidays are recorded as such. Idempotent: a
 * rerun gives the same result. Corrected days and approved leave (set by the leave module) are left alone.
 */
@Injectable()
export class CloseAttendanceDaysUseCase {
  private readonly logger = new Logger(CloseAttendanceDaysUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly calendars: CompanyCalendarLoader,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async runForAllCompanies(): Promise<void> {
    for (const companyId of await this.db.listCompanyIds()) {
      try {
        const calendar = await this.calendars.load(companyId);
        const yesterday = addDays(workDateOf(this.clock.now(), calendar.timeZone), -1);
        const closed = await this.closeDay(companyId, yesterday, calendar);
        this.logger.log(`Closed ${closed} attendance days for ${isoDate(yesterday)} (company ${companyId})`);
      } catch (error) {
        // One company's failure must not stop the others.
        this.logger.error(`Closing attendance failed for company ${companyId}: ${String(error)}`);
      }
    }
  }

  async closeDay(companyId: string, workDate: Date, calendar?: CompanyCalendar): Promise<number> {
    const cal = calendar ?? (await this.calendars.load(companyId));
    const employees = (await this.employees.list(companyId)).filter((e) => employedOn(e, workDate));
    let closed = 0;
    for (const employee of employees) {
      await this.db.transaction(companyId, async () => {
        const day = await this.repository.lockOrCreateDay(companyId, employee.id, workDate);
        if (day.corrected || day.status === "leave") return;
        const punches = await this.repository.acceptedPunches(companyId, day.id);
        await this.repository.updateDay(
          companyId,
          day.id,
          summarizeDay({
            punches,
            workDate,
            kind: cal.kindOf(employee, workDate),
            schedule: cal.scheduleFor(employee),
            timeZone: cal.timeZone,
            closed: true,
          }),
        );
        closed += 1;
      });
    }
    return closed;
  }
}
