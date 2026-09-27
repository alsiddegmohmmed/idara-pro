import { BusinessRuleError } from "../../../shared/errors/errors";

/** Pure business rules — no framework imports (docs/architecture/overview.md). */

export function assertValidEmployeeDates(hireDate: Date, endDate: Date | null | undefined): void {
  if (endDate && hireDate > endDate) {
    throw new BusinessRuleError("employees.invalid_date_range", "hireDate must not be after endDate");
  }
}

export function assertManagerNotSelf(employeeId: string, managerId: string | null | undefined): void {
  if (managerId === employeeId) {
    throw new BusinessRuleError("employees.manager_is_self", "An employee cannot be their own manager");
  }
}

export function assertParentNotSelf(departmentId: string, parentId: string | null | undefined): void {
  if (parentId === departmentId) {
    throw new BusinessRuleError("employees.department_parent_is_self", "A department cannot be its own parent");
  }
}

export function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? new Date(8640000000000000); // open-ended = far future
  const bEnd = bTo ?? new Date(8640000000000000);
  return aFrom <= bEnd && bFrom <= aEnd;
}

export function assertValidDocumentDates(issueDate: Date | null, expiryDate: Date | null): void {
  if (issueDate && expiryDate && issueDate > expiryDate) {
    throw new BusinessRuleError("employees.document.invalid_date_range", "issueDate must not be after expiryDate");
  }
}

/** Both dates must already be UTC-midnight "calendar day" Dates — see
 * apps/api/src/shared/clock/company-date.ts — not raw instants. */
export function daysUntilExpiry(expiryDate: Date, today: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((expiryDate.getTime() - today.getTime()) / msPerDay);
}

/** Reserved thresholdDays value in DocumentExpiryNotice meaning "the one-time
 * already-expired notice was sent" — distinct from any real day-count
 * threshold (docs/adr/0006-document-expiry-job.md). */
export const EXPIRED_NOTICE_THRESHOLD = -1;

/**
 * Which (document, threshold) notices are due right now, given how many days
 * are left and which thresholds already have a dedup row. Uses `daysLeft <=
 * threshold`, not `===`, so a threshold crossed while the job wasn't running
 * (laptop off, server restart) still fires on the next run instead of being
 * silently skipped forever — deliberately can return more than one threshold
 * at once when several were missed. Also returns EXPIRED_NOTICE_THRESHOLD
 * exactly once, whenever the document is already expired and hasn't gotten
 * that one-time notice yet, independent of the reminder thresholds.
 */
export function selectDueExpiryNotices(
  daysLeft: number,
  reminderThresholds: readonly number[],
  alreadyNotifiedThresholds: ReadonlySet<number>,
): number[] {
  const due = reminderThresholds
    .filter((threshold) => daysLeft <= threshold && !alreadyNotifiedThresholds.has(threshold))
    .sort((a, b) => a - b);
  if (daysLeft < 0 && !alreadyNotifiedThresholds.has(EXPIRED_NOTICE_THRESHOLD)) {
    due.push(EXPIRED_NOTICE_THRESHOLD);
  }
  return due;
}
