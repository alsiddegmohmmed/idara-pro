/**
 * AGENTS.md §3 rule 4: work-day dates are computed in company-local time, never
 * server local time. `companies.timezone` (schema default) falls back to this
 * when a company row can't be loaded for some reason.
 */
export const COMPANY_TIME_ZONE = "Asia/Riyadh";

/**
 * Converts a Clock-sourced instant to a UTC-midnight Date representing that
 * calendar day in `timeZone` — matching how Postgres `@db.Date` columns
 * round-trip through Prisma (UTC midnight of the stored calendar day).
 */
export function companyDateOnly(instant: Date, timeZone: string = COMPANY_TIME_ZONE): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return new Date(`${isoDate}T00:00:00.000Z`);
}
