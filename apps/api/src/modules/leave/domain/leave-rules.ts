/** Pure leave rules (docs/domain/business-rules.md "Leave") — no framework imports, no clock. */

/** Requested days = working days in the range (inclusive), excluding weekends and holidays. */
export function workingDaysIn(dates: Date[], isWorkingDay: (date: Date) => boolean): Date[] {
  return dates.filter(isWorkingDay);
}

/** Balances are yearly, so a request must stay inside one calendar year (v1). */
export function sameYear(start: Date, end: Date): boolean {
  return start.getUTCFullYear() === end.getUTCFullYear();
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

/**
 * Days still bookable: entitlement minus approved minus other pending requests — pending days are
 * held so two requests can't both spend the same balance.
 */
export function availableDays(entitled: number, used: number, pending: number): number {
  return Math.max(0, entitled - used - pending);
}
