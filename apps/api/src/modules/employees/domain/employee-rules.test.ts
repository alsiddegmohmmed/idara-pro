import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { assertManagerNotSelf, assertParentNotSelf, assertValidEmployeeDates } from "./employee-rules";

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
