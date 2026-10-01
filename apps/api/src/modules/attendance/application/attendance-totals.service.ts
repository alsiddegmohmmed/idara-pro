import { Inject, Injectable } from "@nestjs/common";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

export interface AttendanceTotals {
  absentDays: number;
  /** Net of the schedule's grace and of approved short permissions. */
  lateMinutes: number;
}

/** Public read for payroll (modules/attendance/index.ts): absences and late minutes per employee in a range. */
@Injectable()
export class AttendanceTotalsService {
  constructor(@Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort) {}

  async totals(companyId: string, employeeIds: string[], from: Date, to: Date): Promise<Map<string, AttendanceTotals>> {
    const result = new Map<string, AttendanceTotals>();
    if (employeeIds.length === 0) return result;
    for (const day of await this.repository.listDays(companyId, { from, to, employeeIds })) {
      const t = result.get(day.employeeId) ?? { absentDays: 0, lateMinutes: 0 };
      if (day.status === "absent") t.absentDays += 1;
      if (day.status === "late") t.lateMinutes += day.lateMin;
      result.set(day.employeeId, t);
    }
    return result;
  }
}
