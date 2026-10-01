import { describe, expect, it } from "vitest";
import { NATIONAL_ID_PATTERN, normalizeLoginIdentifier } from "./auth.js";

describe("login identifier", () => {
  it("turns Arabic-Indic and Persian digits into Latin digits", () => {
    expect(normalizeLoginIdentifier("١٠٢٣٤٥٦٧٨٩")).toBe("1023456789");
    expect(normalizeLoginIdentifier("۲۰۲۳۴۵۶۷۸۹")).toBe("2023456789");
  });
  it("drops spaces and dashes inside an ID number", () => {
    expect(normalizeLoginIdentifier(" 1023 456-789 ")).toBe("1023456789");
  });
  it("lower-cases an email and keeps it otherwise", () => {
    expect(normalizeLoginIdentifier(" Admin@Idara.Local ")).toBe("admin@idara.local");
  });
  it("recognises 10-digit national IDs (1…) and iqamas (2…) only", () => {
    expect(NATIONAL_ID_PATTERN.test("1023456789")).toBe(true);
    expect(NATIONAL_ID_PATTERN.test("2023456789")).toBe(true);
    expect(NATIONAL_ID_PATTERN.test("3023456789")).toBe(false);
    expect(NATIONAL_ID_PATTERN.test("102345678")).toBe(false);
  });
});
