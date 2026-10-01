import { Inject, Injectable } from "@nestjs/common";
import type { Employee } from "@prisma/client";
import { CompanyCalendarLoader } from "../../company";
import { eachDate } from "../../../shared/calendar/work-calendar";
import { parsePayTiers, tierPercents } from "../domain/leave-rules";
import { LEAVE_REPOSITORY, type LeaveRepositoryPort } from "./ports/leave-repository.port";

export interface PayrollLeave {
  /** Working days of unpaid leave types in the range. */
  unpaidDays: number;
  /** Pay percent of each working day of tiered leave (sick leave) in the range, by days used earlier that year. */
  tieredPercents: number[];
  /** Working days per leave type code in the range, for the payslip breakdown. */
  daysByType: Record<string, number>;
}

/** Public read for payroll (modules/leave/index.ts): approved leave in a range, priced by type. */
@Injectable()
export class LeavePayrollService {
  constructor(
    @Inject(LEAVE_REPOSITORY) private readonly repository: LeaveRepositoryPort,
    private readonly calendars: CompanyCalendarLoader,
  ) {}

  async leaveFor(companyId: string, employees: Employee[], from: Date, to: Date): Promise<Map<string, PayrollLeave>> {
    const result = new Map<string, PayrollLeave>();
    if (employees.length === 0) return result;
    const calendar = await this.calendars.load(companyId);
    // From 1 January: tiered pay depends on how many days of that type were taken earlier in the year.
    const yearStart = new Date(Date.UTC(from.getUTCFullYear(), 0, 1));
    const approved = await this.repository.list(companyId, { employeeIds: employees.map((e) => e.id), status: "approved", from: yearStart, to });
    for (const employee of employees) {
      const entry: PayrollLeave = { unpaidDays: 0, tieredPercents: [], daysByType: {} };
      const mine = approved.filter((r) => r.employeeId === employee.id).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      const usedByType = new Map<string, number>();
      for (const request of mine) {
        const start = request.startDate.getTime() < yearStart.getTime() ? yearStart : request.startDate;
        const end = request.endDate.getTime() > to.getTime() ? to : request.endDate;
        if (end.getTime() < start.getTime()) continue;
        const tiers = parsePayTiers(request.leaveType.payTiers);
        for (const date of eachDate(start, end)) {
          if (calendar.kindOf(employee, date) !== "working") continue;
          const used = usedByType.get(request.leaveTypeId) ?? 0;
          usedByType.set(request.leaveTypeId, used + 1);
          if (date.getTime() < from.getTime()) continue;
          const code = request.leaveType.code;
          entry.daysByType[code] = (entry.daysByType[code] ?? 0) + 1;
          if (tiers) entry.tieredPercents.push(...tierPercents(tiers, used, 1));
          else if (!request.leaveType.paid) entry.unpaidDays += 1;
        }
      }
      result.set(employee.id, entry);
    }
    return result;
  }
}
