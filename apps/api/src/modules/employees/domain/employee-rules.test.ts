import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../../../shared/errors/errors";
import {
  assertManagerNotSelf,
  assertParentNotSelf,
  assertValidDocumentDates,
  assertValidEmployeeDates,
  dateRangesOverlap,
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
