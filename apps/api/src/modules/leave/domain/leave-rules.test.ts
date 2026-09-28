import { describe, expect, it } from "vitest";
import { dayKind, eachDate } from "../../../shared/calendar/work-calendar";
import { availableDays, rangesOverlap, sameYear, workingDaysIn } from "./leave-rules";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const weekend = [5, 6];

describe("leave rules", () => {
  it("counts only working days: a Thursday-to-Sunday request is 2 days", () => {
    const dates = eachDate(d("2026-10-01"), d("2026-10-04")); // Thu, Fri, Sat, Sun
    const days = workingDaysIn(dates, (x) => dayKind(x, weekend, new Set(), null) === "working");
    expect(days.map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("excludes public holidays inside the range", () => {
    const dates = eachDate(d("2026-09-21"), d("2026-09-24")); // Mon–Thu, 23rd is a holiday
    const days = workingDaysIn(dates, (x) => dayKind(x, weekend, new Set(["2026-09-23"]), null) === "working");
    expect(days).toHaveLength(3);
  });

  it("refuses a request that crosses the year boundary", () => {
    expect(sameYear(d("2026-12-30"), d("2027-01-02"))).toBe(false);
    expect(sameYear(d("2026-01-01"), d("2026-12-31"))).toBe(true);
  });

  it("detects overlapping ranges, including touching on one day", () => {
    expect(rangesOverlap(d("2026-10-01"), d("2026-10-05"), d("2026-10-05"), d("2026-10-07"))).toBe(true);
    expect(rangesOverlap(d("2026-10-01"), d("2026-10-04"), d("2026-10-05"), d("2026-10-07"))).toBe(false);
  });

  it("holds pending days against the balance and never goes negative", () => {
    expect(availableDays(21, 5, 3)).toBe(13);
    expect(availableDays(21, 20, 3)).toBe(0);
  });
});
