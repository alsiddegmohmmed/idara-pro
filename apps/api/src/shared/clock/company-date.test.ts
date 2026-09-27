import { describe, expect, it } from "vitest";
import { companyDateOnly } from "./company-date";

describe("companyDateOnly", () => {
  it("returns the same calendar day for a midday UTC instant", () => {
    expect(companyDateOnly(new Date("2026-06-15T12:00:00.000Z"), "Asia/Riyadh")).toEqual(
      new Date("2026-06-15T00:00:00.000Z"),
    );
  });

  it("rolls over to the next calendar day for a late-evening UTC instant (Riyadh is UTC+3)", () => {
    // 21:30 UTC on the 14th is already 00:30 on the 15th in Asia/Riyadh.
    expect(companyDateOnly(new Date("2026-06-14T21:30:00.000Z"), "Asia/Riyadh")).toEqual(
      new Date("2026-06-15T00:00:00.000Z"),
    );
  });

  it("does not roll over for an instant just before the Riyadh day boundary", () => {
    // 20:30 UTC on the 14th is still 23:30 on the 14th in Asia/Riyadh.
    expect(companyDateOnly(new Date("2026-06-14T20:30:00.000Z"), "Asia/Riyadh")).toEqual(
      new Date("2026-06-14T00:00:00.000Z"),
    );
  });

  it("defaults to Asia/Riyadh when no timezone is given", () => {
    expect(companyDateOnly(new Date("2026-06-14T21:30:00.000Z"))).toEqual(new Date("2026-06-15T00:00:00.000Z"));
  });
});
