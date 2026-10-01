import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DEDUCTION_PERCENT, deductionCapHalalas } from "./discipline.js";

describe("deductionCapHalalas", () => {
  it("is half the month's pay by default", () => {
    expect(deductionCapHalalas(800_000n, DEFAULT_MAX_DEDUCTION_PERCENT)).toBe(400_000n);
  });

  it("keeps a decimal percent instead of rounding it to a whole number", () => {
    // 33.33% of SAR 10,000.00 is SAR 3,333.00 — not 3,300.00 (33%).
    expect(deductionCapHalalas(1_000_000n, 33.33)).toBe(333_300n);
  });

  it("rounds down to the halala", () => {
    expect(deductionCapHalalas(1n, 50)).toBe(0n);
    expect(deductionCapHalalas(333n, 50)).toBe(166n);
  });

  it("is zero without pay", () => {
    expect(deductionCapHalalas(0n, 50)).toBe(0n);
  });
});
