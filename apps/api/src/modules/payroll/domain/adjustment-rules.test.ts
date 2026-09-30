import { describe, expect, it } from "vitest";
import { assertPeriodOpen, assertWithinDeductionCap } from "./adjustment-rules";

describe("deduction cap", () => {
  it("allows deductions up to the cap, exactly", () => {
    expect(() => assertWithinDeductionCap(1_000_000n, 300_000n, 200_000n, 50)).not.toThrow();
  });
  it("refuses one halala over the cap", () => {
    expect(() => assertWithinDeductionCap(1_000_000n, 300_000n, 200_001n, 50)).toThrow("monthly deduction limit");
  });
  it("refuses when no salary is on file", () => {
    expect(() => assertWithinDeductionCap(0n, 0n, 1n, 50)).toThrow("No salary");
  });
});

describe("open periods", () => {
  it("accepts the previous month across a year boundary", () => {
    expect(() => assertPeriodOpen("2025-12", "2026-01")).not.toThrow();
  });
  it("refuses two months back", () => {
    expect(() => assertPeriodOpen("2025-11", "2026-01")).toThrow("closed");
  });
});
