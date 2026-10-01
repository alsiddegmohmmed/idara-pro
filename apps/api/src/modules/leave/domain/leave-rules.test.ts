import { describe, expect, it } from "vitest";
import { dayKind, eachDate } from "../../../shared/calendar/work-calendar";
import { availableDays, parsePayTiers, rangesOverlap, sameYear, tierPercents, workingDaysIn } from "./leave-rules";

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

  describe("sick-leave pay tiers (30 at 100%, 60 at 75%, 30 at 0%)", () => {
    const sick = [
      { days: 30, percent: 100 },
      { days: 60, percent: 75 },
      { days: 30, percent: 0 },
    ];
    it("pays the first 30 days in full", () => {
      expect(tierPercents(sick, 0, 3)).toEqual([100, 100, 100]);
    });
    it("splits a request that crosses from full to 75% pay", () => {
      expect(tierPercents(sick, 28, 4)).toEqual([100, 100, 75, 75]);
    });
    it("is unpaid from day 91 and past the last tier", () => {
      expect(tierPercents(sick, 89, 2)).toEqual([75, 0]);
      expect(tierPercents(sick, 125, 1)).toEqual([0]);
    });
    it("ignores malformed stored tiers", () => {
      expect(parsePayTiers([{ days: 30, percent: 100 }, { days: "x" }])).toEqual([{ days: 30, percent: 100 }]);
      expect(parsePayTiers(null)).toBeNull();
    });
  });
});
