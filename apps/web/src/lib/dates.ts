// ui-spec §8: Western digits, company time zone, never the browser's locale or zone.
const dateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026-09-28 14:05" in Asia/Riyadh. */
export function formatDateTime(iso: string): string {
  const parts = Object.fromEntries(dateTime.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** "الأحد 28 سبتمبر 2026" / "Sunday 28 September 2026" — Gregorian, Western digits, Asia/Riyadh. */
export function formatLongDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Hour of day in Asia/Riyadh (for the greeting). */
export function riyadhHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(date)) % 24;
}

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "08:05" in Asia/Riyadh, or "—". */
export function formatTime(iso: string | null): string {
  return iso ? time.format(new Date(iso)) : "—";
}

/** Minutes as "7:40" (hours:minutes). */
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Today's date (YYYY-MM-DD) in Asia/Riyadh. */
export function todayInRiyadh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A Riyadh wall-clock time on a date as an ISO instant (Riyadh is UTC+3 all year, no DST). */
export function riyadhInstant(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+03:00`;
}

/**
 * Unicode isolates (LRI … PDI) for LTR fragments inside translated strings. A date like 2026-09-28 or a
 * range "2026-09-28 → 2026-10-01" otherwise gets reordered by the bidi algorithm inside Arabic text.
 * Use for interpolation params; in JSX prefer <bdi dir="ltr">.
 */
export const ltr = (text: string): string => `⁦${text}⁩`;

/** "2026-09-28" or "2026-09-28 → 2026-10-01" (always read left to right). */
export function formatDateRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}
