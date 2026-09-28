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
