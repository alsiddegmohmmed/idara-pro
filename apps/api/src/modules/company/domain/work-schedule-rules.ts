import { BusinessRuleError } from "../../../shared/errors/errors";

/** Pure business rules — no framework imports (docs/architecture/overview.md). */

export function assertValidScheduleTimes(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw new BusinessRuleError("company.schedule.invalid_time_range", "startTime must be before endTime");
  }
}

export function assertValidWorkDays(workDays: number[]): void {
  if (workDays.length === 0) {
    throw new BusinessRuleError("company.schedule.empty_work_days", "workDays must not be empty");
  }
  if (new Set(workDays).size !== workDays.length) {
    throw new BusinessRuleError("company.schedule.duplicate_work_days", "workDays must not contain duplicates");
  }
  if (workDays.some((day) => day < 0 || day > 6)) {
    throw new BusinessRuleError("company.schedule.invalid_work_day", "workDays must be between 0 and 6");
  }
}
