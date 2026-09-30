import { describe, expect, it } from "vitest";
import { isWarningActive, remainingAllowance, shortLeaveMinutes, timesOverlap } from "./discipline-rules";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("short permissions", () => {
  it("counts the minutes between two times", () => {
    expect(shortLeaveMinutes("08:00", "09:30")).toBe(90);
  });
  it("refuses an end before the start", () => {
    expect(() => shortLeaveMinutes("10:00", "09:00")).toThrow("end time must be after");
  });
  it("detects overlapping requests, not touching ones", () => {
    expect(timesOverlap({ fromTime: "08:00", toTime: "09:00" }, { fromTime: "08:30", toTime: "10:00" })).toBe(true);
    expect(timesOverlap({ fromTime: "08:00", toTime: "09:00" }, { fromTime: "09:00", toTime: "10:00" })).toBe(false);
  });
  it("never reports a negative allowance", () => {
    expect(remainingAllowance(240, 200, 60)).toBe(0);
    expect(remainingAllowance(240, 60, 30)).toBe(150);
  });
});

describe("warnings", () => {
  it("stays active for the configured days from the incident, inclusive", () => {
    expect(isWarningActive({ status: "issued", incidentDate: d("2026-01-01") }, 180, d("2026-06-29"))).toBe(true);
    expect(isWarningActive({ status: "issued", incidentDate: d("2026-01-01") }, 180, d("2026-06-30"))).toBe(false);
  });
  it("is never active once rescinded or before it is issued", () => {
    expect(isWarningActive({ status: "rescinded", incidentDate: d("2026-09-01") }, 180, d("2026-09-02"))).toBe(false);
    expect(isWarningActive({ status: "proposed", incidentDate: d("2026-09-01") }, 180, d("2026-09-02"))).toBe(false);
  });
});
