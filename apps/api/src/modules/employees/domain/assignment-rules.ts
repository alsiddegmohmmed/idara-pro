import { BusinessRuleError } from "../../../shared/errors/errors";

/** Pure career-history rules (ADR-0012). Dates are company calendar days as UTC-midnight Dates. */

export interface AssignmentValues {
  branchId: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  scheduleId: string | null;
}

const DAY_MS = 86_400_000;

export const dayBefore = (d: Date): Date => new Date(d.getTime() - DAY_MS);

export function sameAssignment(a: AssignmentValues, b: AssignmentValues): boolean {
  return (
    a.branchId === b.branchId &&
    a.departmentId === b.departmentId &&
    a.jobTitle === b.jobTitle &&
    a.managerId === b.managerId &&
    a.scheduleId === b.scheduleId
  );
}

/**
 * How a change effective on `effective` fits after the current row that started on `currentFrom`:
 * - `replace` — same day the current row started: correct that row in place (no zero-length period);
 * - `append` — close the current row the day before and start a new one.
 * The past is never rewritten, so a date before the current row's start is refused.
 */
export function planChange(currentFrom: Date, effective: Date): "replace" | "append" {
  if (effective.getTime() < currentFrom.getTime()) {
    throw new BusinessRuleError(
      "employees.assignment.before_current",
      "The effective date is before the employee's current assignment started",
    );
  }
  return effective.getTime() === currentFrom.getTime() ? "replace" : "append";
}
