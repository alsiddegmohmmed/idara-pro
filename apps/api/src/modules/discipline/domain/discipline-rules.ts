import { BusinessRuleError } from "../../../shared/errors/errors";

/** Pure rules for warnings and short permissions (business-rules.md). */

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Length of a short permission; "to" must be after "from" on the same day. */
export function shortLeaveMinutes(fromTime: string, toTime: string): number {
  const minutes = toMinutes(toTime) - toMinutes(fromTime);
  if (minutes <= 0) throw new BusinessRuleError("shortleave.invalid_times", "The end time must be after the start time");
  return minutes;
}

export function timesOverlap(a: { fromTime: string; toTime: string }, b: { fromTime: string; toTime: string }): boolean {
  return toMinutes(a.fromTime) < toMinutes(b.toTime) && toMinutes(b.fromTime) < toMinutes(a.toTime);
}

/** The monthly allowance left after approved and pending requests (never negative). */
export function remainingAllowance(allowance: number, used: number, pending: number): number {
  return Math.max(0, allowance - used - pending);
}

/** An issued warning counts for `activeDays` from the incident (inclusive), unless rescinded. */
export function isWarningActive(w: { status: string; incidentDate: Date }, activeDays: number, today: Date): boolean {
  if (w.status !== "issued") return false;
  return today.getTime() <= w.incidentDate.getTime() + (activeDays - 1) * 86_400_000;
}

/** YYYY-MM of a company date. */
export const monthOf = (d: Date): string => d.toISOString().slice(0, 7);
