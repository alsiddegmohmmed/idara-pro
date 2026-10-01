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

export interface PayTier {
  days: number;
  percent: number;
}

/**
 * Pay percent for each of the next `count` days of a tiered leave type (e.g. sick leave: 30 days at 100%,
 * 60 at 75%, 30 at 0%), given how many days of it were already used this year. Past the last tier: unpaid.
 */
export function tierPercents(tiers: PayTier[], usedBefore: number, count: number): number[] {
  const result: number[] = [];
  for (let n = usedBefore; n < usedBefore + count; n += 1) {
    let start = 0;
    const tier = tiers.find((t) => {
      const inTier = n < start + t.days;
      start += t.days;
      return inTier;
    });
    result.push(tier ? tier.percent : 0);
  }
  return result;
}

/** Narrows the stored JSON to tiers, ignoring anything malformed (the DB check only guarantees an array). */
export function parsePayTiers(value: unknown): PayTier[] | null {
  if (!Array.isArray(value)) return null;
  const tiers = value.filter(
    (t): t is PayTier => typeof t === "object" && t !== null && Number.isInteger((t as PayTier).days) && Number.isInteger((t as PayTier).percent),
  );
  return tiers.length > 0 ? tiers : null;
}
