import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { assertValidScheduleTimes, assertValidWorkDays } from "./work-schedule-rules";

describe("assertValidScheduleTimes", () => {
  it("accepts a start time before the end time", () => {
    expect(() => assertValidScheduleTimes("08:00", "17:00")).not.toThrow();
  });

  it("rejects a start time equal to the end time", () => {
    expect(() => assertValidScheduleTimes("08:00", "08:00")).toThrow(BusinessRuleError);
  });

  it("rejects a start time after the end time", () => {
    expect(() => assertValidScheduleTimes("18:00", "08:00")).toThrow(BusinessRuleError);
  });
});

describe("assertValidWorkDays", () => {
  it("accepts a valid set of days", () => {
    expect(() => assertValidWorkDays([0, 1, 2, 3, 4])).not.toThrow();
  });

  it("rejects an empty array", () => {
    expect(() => assertValidWorkDays([])).toThrow(BusinessRuleError);
  });

  it("rejects duplicate days", () => {
    expect(() => assertValidWorkDays([1, 1, 2])).toThrow(BusinessRuleError);
  });

  it("rejects a day outside 0-6", () => {
    expect(() => assertValidWorkDays([0, 7])).toThrow(BusinessRuleError);
  });
});
