import { describe, expect, it } from "vitest";
import { foldName, orderByManager, parseImportAmount, parseImportDate, parseImportRow, type ImportLookups } from "./employee-import";

const B1 = "0190a000-0000-7000-8000-000000000001";
const D1 = "0190a000-0000-7000-8000-000000000002";
const S1 = "0190a000-0000-7000-8000-000000000003";

const lookups: ImportLookups = {
  branches: new Map([[foldName("الفرع الرئيسي"), B1]]),
  departments: new Map([[foldName("المالية"), D1]]),
  schedules: new Map([[foldName("دوام صباحي"), S1]]),
  countries: new Map([
    [foldName("SA"), "SA"],
    [foldName("السعودية"), "SA"],
    [foldName("مصر"), "EG"],
    [foldName("Egypt"), "EG"],
  ]),
  onlyBranchId: B1,
};

const minimal = { fullNameAr: "محمد", fullNameEn: "Mohammed", nationalId: "1012345678", nationality: "SA", hireDate: "2024-01-15" };

describe("parseImportDate", () => {
  it("reads ISO, day/month/year and Excel serial dates", () => {
    expect(parseImportDate("2024-01-15")).toBe("2024-01-15");
    expect(parseImportDate("15/1/2024")).toBe("2024-01-15");
    expect(parseImportDate("١٥-٠١-٢٠٢٤")).toBe("2024-01-15");
    expect(parseImportDate("45306")).toBe("2024-01-15");
  });
  it("rejects dates that don't exist", () => {
    expect(parseImportDate("2024-02-30")).toBeNull();
    expect(parseImportDate("31/04/2024")).toBeNull();
    expect(parseImportDate("next week")).toBeNull();
  });
});

describe("parseImportAmount", () => {
  it("turns riyals into halalas without floating point", () => {
    expect(parseImportAmount("6000")).toBe("600000");
    expect(parseImportAmount("6,000.5")).toBe("600050");
    expect(parseImportAmount("٦٠٠٠٫٢٥")).toBe("600025");
  });
  it("rejects negatives, text and more than two decimals", () => {
    expect(parseImportAmount("-5")).toBeNull();
    expect(parseImportAmount("abc")).toBeNull();
    expect(parseImportAmount("1.005")).toBeNull();
  });
});

describe("parseImportRow", () => {
  it("accepts a minimal row and fills the only branch", () => {
    const r = parseImportRow(minimal, lookups);
    expect(r.errors).toEqual([]);
    expect(r.input).toMatchObject({ nationality: "SA", isSaudi: true, branchId: B1, hireDate: "2024-01-15", status: "active" });
  });

  it("matches names regardless of hamza, taa marbuta and spacing", () => {
    const r = parseImportRow({ ...minimal, nationality: "مصر", nationalId: "2012345678", department: " المالية ", schedule: "دوام  صباحي" }, lookups);
    expect(r.errors).toEqual([]);
    expect(r.input).toMatchObject({ nationality: "EG", isSaudi: false, departmentId: D1, scheduleId: S1 });
  });

  it("says which required cells are empty", () => {
    const r = parseImportRow({ fullNameAr: "محمد" }, lookups);
    expect(r.input).toBeNull();
    expect(r.errors.map((e) => `${e.column}:${e.code}`).sort()).toEqual(
      ["fullNameEn:required", "hireDate:required", "nationalId:required", "nationality:required"].sort(),
    );
  });

  it("reports unknown references, bad formats and personal words in Arabic or English", () => {
    const r = parseImportRow(
      { ...minimal, branch: "جدة", nationalId: "999", gender: "Female", maritalStatus: "متزوجة", phone: "x", birthDate: "2030-01-01" },
      lookups,
    );
    const codes = Object.fromEntries(r.errors.map((e) => [e.column, e.code]));
    expect(codes).toMatchObject({ branch: "unknown", nationalId: "invalid", phone: "invalid", birthDate: "after_hire" });
    expect(codes.gender).toBeUndefined();
    expect(codes.maritalStatus).toBeUndefined();
  });

  it("collects salary amounts in halalas and skips zeros", () => {
    const r = parseImportRow({ ...minimal, basicSalary: "6000", housingAllowance: "0", transportAllowance: "500.5" }, lookups);
    expect(r.salary).toEqual({ basic: "600000", transport: "50050" });
  });
});

describe("orderByManager", () => {
  it("creates managers in the file before their reports", () => {
    const { order, cycle } = orderByManager([
      { employeeNo: "E-3", managerNo: "E-2" },
      { employeeNo: "E-2", managerNo: "E-1" },
      { employeeNo: "E-1", managerNo: null },
    ]);
    expect(order).toEqual([2, 1, 0]);
    expect(cycle).toEqual([]);
  });
  it("finds manager loops", () => {
    const { cycle } = orderByManager([
      { employeeNo: "E-1", managerNo: "E-2" },
      { employeeNo: "E-2", managerNo: "E-1" },
      { employeeNo: "E-3", managerNo: null },
    ]);
    expect(cycle.sort()).toEqual([0, 1]);
  });
});
