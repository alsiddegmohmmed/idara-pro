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
