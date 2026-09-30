import { describe, expect, it } from "vitest";
import { dayBefore, planChange, sameAssignment } from "./assignment-rules";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const base = { branchId: "riyadh", departmentId: null, jobTitle: "Cashier", managerId: null, scheduleId: null };

describe("assignment rules", () => {
  it("appends a new period when the change starts after the current one", () => {
    expect(planChange(d("2026-01-01"), d("2026-10-01"))).toBe("append");
  });

  it("corrects the current period in place when the change starts the same day", () => {
    expect(planChange(d("2026-10-01"), d("2026-10-01"))).toBe("replace");
  });

  it("refuses to rewrite the past", () => {
    expect(() => planChange(d("2026-10-01"), d("2026-09-30"))).toThrow("before the employee's current assignment");
  });

  it("closes the previous period the day before, across a month boundary", () => {
    expect(dayBefore(d("2026-03-01")).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("compares every tracked field", () => {
    expect(sameAssignment(base, { ...base })).toBe(true);
    expect(sameAssignment(base, { ...base, jobTitle: "Supervisor" })).toBe(false);
  });
});
