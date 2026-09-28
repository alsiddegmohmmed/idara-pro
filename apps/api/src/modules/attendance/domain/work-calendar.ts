/**
 * Work days are calendar dates in the company time zone, represented as UTC-midnight Dates
 * (how Postgres `date` columns round-trip through Prisma — see shared/clock/company-date.ts).
 */

export interface ScheduleTimes {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm", after startTime (same-day schedules only in v1)
  lateGraceMin: number;
  workDays: number[]; // 0 = Sunday … 6 = Saturday
}

export type DayKind = "working" | "weekend" | "holiday";

export function isoDate(workDate: Date): string {
  return workDate.toISOString().slice(0, 10);
}

export function addDays(workDate: Date, days: number): Date {
  return new Date(workDate.getTime() + days * 86_400_000);
}

/** Every date from `from` to `to` inclusive. */
export function eachDate(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) dates.push(d);
  return dates;
}

/**
 * A working day is not a company weekend day, not a public holiday, and — when the employee has a
 * schedule — one of the schedule's work days (business-rules.md "Time and calendar").
 */
export function dayKind(
  workDate: Date,
  weekendDays: number[],
  holidayDates: ReadonlySet<string>,
  schedule: Pick<ScheduleTimes, "workDays"> | null,
): DayKind {
  if (holidayDates.has(isoDate(workDate))) return "holiday";
  const weekday = workDate.getUTCDay();
  if (weekendDays.includes(weekday)) return "weekend";
  if (schedule && !schedule.workDays.includes(weekday)) return "weekend";
  return "working";
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Asia/Riyadh = +180). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The instant a local wall-clock time ("HH:mm") happens on `workDate` in `timeZone`. */
export function localTimeToInstant(workDate: Date, time: string, timeZone: string): Date {
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const guess = Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), hh, mm);
  return new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000);
}

/** Calendar date of `instant` in `timeZone`, as a UTC-midnight Date. */
export function workDateOf(instant: Date, timeZone: string): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  return new Date(`${iso}T00:00:00.000Z`);
}
