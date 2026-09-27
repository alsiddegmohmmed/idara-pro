import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../../../shared/errors/errors";
import {
  assertManagerNotSelf,
  assertParentNotSelf,
  assertValidDocumentDates,
  assertValidEmployeeDates,
  dateRangesOverlap,
  daysUntilExpiry,
  EXPIRED_NOTICE_THRESHOLD,
  selectDueExpiryNotices,
} from "./employee-rules";

describe("assertValidEmployeeDates", () => {
  it("accepts a hire date before the end date", () => {
    expect(() => assertValidEmployeeDates(new Date("2026-01-01"), new Date("2026-06-01"))).not.toThrow();
  });

  it("accepts a hire date with no end date", () => {
    expect(() => assertValidEmployeeDates(new Date("2026-01-01"), null)).not.toThrow();
  });

  it("accepts a hire date equal to the end date (last-day employee)", () => {
    expect(() => assertValidEmployeeDates(new Date("2026-01-01"), new Date("2026-01-01"))).not.toThrow();
  });

  it("rejects a hire date after the end date", () => {
    expect(() => assertValidEmployeeDates(new Date("2026-06-01"), new Date("2026-01-01"))).toThrow(BusinessRuleError);
  });
});

describe("assertManagerNotSelf", () => {
  it("accepts a different manager", () => {
    expect(() => assertManagerNotSelf("emp-1", "emp-2")).not.toThrow();
  });

  it("accepts no manager", () => {
    expect(() => assertManagerNotSelf("emp-1", null)).not.toThrow();
  });

  it("rejects an employee managing themselves", () => {
    expect(() => assertManagerNotSelf("emp-1", "emp-1")).toThrow(BusinessRuleError);
  });
});

describe("assertParentNotSelf", () => {
  it("rejects a department being its own parent", () => {
    expect(() => assertParentNotSelf("dept-1", "dept-1")).toThrow(BusinessRuleError);
  });
});

describe("dateRangesOverlap", () => {
  it("detects overlapping closed ranges", () => {
    expect(
      dateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-03-01"), new Date("2026-09-01")),
    ).toBe(true);
  });

  it("does not flag adjacent, non-overlapping ranges", () => {
    expect(
      dateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-07-01"), new Date("2026-12-01")),
    ).toBe(false);
  });

  it("treats a null end date as open-ended, overlapping anything after it starts", () => {
    expect(dateRangesOverlap(new Date("2026-01-01"), null, new Date("2030-01-01"), new Date("2031-01-01"))).toBe(true);
  });

  it("does not flag a range entirely before an open-ended one starts", () => {
    expect(dateRangesOverlap(new Date("2030-01-01"), null, new Date("2020-01-01"), new Date("2021-01-01"))).toBe(
      false,
    );
  });

  it("treats two ranges sharing the exact same boundary date as overlapping (inclusive day-ranges)", () => {
    expect(
      dateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-06-01"), new Date("2026-12-01")),
    ).toBe(true);
  });

  it("does not flag ranges separated by a full day gap", () => {
    expect(
      dateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-06-02"), new Date("2026-12-01")),
    ).toBe(false);
  });
});

describe("assertValidDocumentDates", () => {
  it("accepts an issue date before the expiry date", () => {
    expect(() => assertValidDocumentDates(new Date("2026-01-01"), new Date("2030-01-01"))).not.toThrow();
  });

  it("accepts missing dates", () => {
    expect(() => assertValidDocumentDates(null, null)).not.toThrow();
  });

  it("rejects an issue date after the expiry date", () => {
    expect(() => assertValidDocumentDates(new Date("2030-01-01"), new Date("2026-01-01"))).toThrow(BusinessRuleError);
  });
});

describe("daysUntilExpiry", () => {
  it("returns 0 when expiry is today", () => {
    expect(daysUntilExpiry(new Date("2026-06-15T00:00:00.000Z"), new Date("2026-06-15T00:00:00.000Z"))).toBe(0);
  });

  it("returns a positive count when expiry is in the future", () => {
    expect(daysUntilExpiry(new Date("2026-06-22T00:00:00.000Z"), new Date("2026-06-15T00:00:00.000Z"))).toBe(7);
  });

  it("returns a negative count when expiry is in the past", () => {
    expect(daysUntilExpiry(new Date("2026-06-10T00:00:00.000Z"), new Date("2026-06-15T00:00:00.000Z"))).toBe(-5);
  });

  it("counts correctly across a month boundary", () => {
    expect(daysUntilExpiry(new Date("2026-07-05T00:00:00.000Z"), new Date("2026-06-28T00:00:00.000Z"))).toBe(7);
  });
});

describe("selectDueExpiryNotices", () => {
  const thresholds = [60, 30, 7];

  it("fires the 60-day reminder the first time it's crossed", () => {
    expect(selectDueExpiryNotices(60, thresholds, new Set())).toEqual([60]);
  });

  it("does not re-fire an already-notified threshold the next day", () => {
    expect(selectDueExpiryNotices(59, thresholds, new Set([60]))).toEqual([]);
  });

  it("fires the 30-day reminder once 60 has already been notified", () => {
    expect(selectDueExpiryNotices(30, thresholds, new Set([60]))).toEqual([30]);
  });

  it("catches up a skipped day: still fires 30 even though daysLeft has already passed it", () => {
    // The job didn't run on the day daysLeft was exactly 30 (e.g. server was down).
    expect(selectDueExpiryNotices(25, thresholds, new Set([60]))).toEqual([30]);
  });

  it("catches up several missed thresholds at once, sorted ascending", () => {
    expect(selectDueExpiryNotices(-3, thresholds, new Set())).toEqual([7, 30, 60, EXPIRED_NOTICE_THRESHOLD]);
  });

  it("fires the one-time expired notice once every reminder threshold is already notified", () => {
    expect(selectDueExpiryNotices(-3, thresholds, new Set([60, 30, 7]))).toEqual([EXPIRED_NOTICE_THRESHOLD]);
  });

  it("fires nothing once every threshold, including the expired sentinel, is notified", () => {
    expect(selectDueExpiryNotices(-3, thresholds, new Set([60, 30, 7, EXPIRED_NOTICE_THRESHOLD]))).toEqual([]);
  });

  it("does not fire the expired notice while the document has not expired yet", () => {
    expect(selectDueExpiryNotices(0, thresholds, new Set([60, 30, 7]))).toEqual([]);
  });
});
