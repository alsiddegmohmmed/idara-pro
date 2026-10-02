import {
  CreateEmployeeSchema,
  IMPORT_GENDER_WORDS,
  IMPORT_MARITAL_WORDS,
  normalizeDigits,
  type CreateEmployee,
  type ImportColumnKey,
  type ImportRowError,
} from "@idara-pro/shared";

/**
 * Pure rules for one row of the employee import (no database, no clock): cell text in, a validated
 * CreateEmployee plus the references still to resolve (manager by employee number) and row errors out.
 */

export type ImportCells = Partial<Record<ImportColumnKey, string>>;

/** Names and codes the sheet may refer to, already folded with `foldName`. */
export interface ImportLookups {
  branches: ReadonlyMap<string, string>;
  departments: ReadonlyMap<string, string>;
  schedules: ReadonlyMap<string, string>;
  /** ISO code, Arabic name or English name → ISO code. */
  countries: ReadonlyMap<string, string>;
  /** When the company has exactly one branch, an empty branch cell means that branch. */
  onlyBranchId: string | null;
}

export interface ParsedImportRow {
  input: CreateEmployee | null;
  managerNo: string | null;
  /** Monthly amounts in halalas (integer strings) by salary component type. */
  salary: Partial<Record<"basic" | "housing" | "transport", string>>;
  errors: ImportRowError[];
}

/** Case, spacing, Arabic letter variants and diacritics don't matter when matching a name. */
export function foldName(value: string): string {
  return normalizeDigits(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * A date cell as YYYY-MM-DD. Accepts ISO dates, D/M/YYYY (or with - or .), and Excel serial numbers
 * (days since 1899-12-30) — what a cell holds after Excel "helpfully" converted it. Null if not a real date.
 */
export function parseImportDate(raw: string): string | null {
  const v = normalizeDigits(raw).trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial < 1 || serial > 2_958_465) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** "6000", "6,000.50", "٦٠٠٠" → halalas as an integer string; null if not a non-negative amount with ≤ 2 decimals. */
export function parseImportAmount(raw: string): string | null {
  const v = normalizeDigits(raw).trim().replace(/[,\s٬]/g, "").replace("٫", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!match) return null;
  return (BigInt(match[1] as string) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))).toString();
}

const PERSONAL: ImportColumnKey[] = ["gender", "birthDate", "maritalStatus", "phone", "additionalPhone", "personalEmail"];
const SALARY: Array<[ImportColumnKey, "basic" | "housing" | "transport"]> = [
  ["basicSalary", "basic"],
  ["housingAllowance", "housing"],
  ["transportAllowance", "transport"],
];

/** Zod issue paths on CreateEmployee → the sheet column they came from. */
const FIELD_COLUMN: Record<string, ImportColumnKey> = {
  employeeNo: "employeeNo", fullNameAr: "fullNameAr", fullNameEn: "fullNameEn", nationalId: "nationalId",
  nationality: "nationality", gender: "gender", birthDate: "birthDate", maritalStatus: "maritalStatus",
  phone: "phone", additionalPhone: "additionalPhone", personalEmail: "personalEmail", jobTitle: "jobTitle",
  departmentId: "department", branchId: "branch", scheduleId: "schedule", hireDate: "hireDate", endDate: "hireDate", iban: "iban",
};

/** Which columns in this row hold personal data / salary — the caller checks the matching permissions. */
export function usesPersonal(cells: ImportCells): boolean {
  return PERSONAL.some((k) => (cells[k] ?? "").trim() !== "");
}
export function usesSalary(cells: ImportCells): boolean {
  return SALARY.some(([k]) => (cells[k] ?? "").trim() !== "");
}

export function parseImportRow(cells: ImportCells, lookups: ImportLookups): ParsedImportRow {
  const errors: ImportRowError[] = [];
  const cell = (k: ImportColumnKey): string => (cells[k] ?? "").trim();
  const fail = (column: ImportRowError["column"], code: string): void => {
    if (!errors.some((e) => e.column === column)) errors.push({ column, code });
  };
  const lookup = (k: ImportColumnKey, map: ReadonlyMap<string, string>): string | null | undefined => {
    if (!cell(k)) return undefined;
    const id = map.get(foldName(cell(k)));
    if (!id) fail(k, "unknown");
    return id ?? null;
  };
  const date = (k: ImportColumnKey): string | undefined => {
    if (!cell(k)) return undefined;
    const d = parseImportDate(cell(k));
    if (!d) fail(k, "invalid_date");
    return d ?? undefined;
  };

  for (const k of ["fullNameAr", "fullNameEn", "nationalId", "nationality", "hireDate"] as const) if (!cell(k)) fail(k, "required");

  const nationality = cell("nationality") ? (lookups.countries.get(foldName(cell("nationality"))) ?? null) : null;
  if (cell("nationality") && !nationality) fail("nationality", "unknown");

  let gender: "male" | "female" | undefined;
  if (cell("gender")) {
    gender = IMPORT_GENDER_WORDS[foldName(cell("gender"))] ?? IMPORT_GENDER_WORDS[cell("gender").toLowerCase()];
    if (!gender) fail("gender", "unknown");
  }
  let maritalStatus: "single" | "married" | "divorced" | "widowed" | undefined;
  if (cell("maritalStatus")) {
    maritalStatus = IMPORT_MARITAL_WORDS[cell("maritalStatus").toLowerCase()] ?? IMPORT_MARITAL_WORDS[foldName(cell("maritalStatus"))];
    if (!maritalStatus) {
      // Folding turns أ into ا: try the folded forms of the accepted words too.
      const folded = Object.entries(IMPORT_MARITAL_WORDS).find(([w]) => foldName(w) === foldName(cell("maritalStatus")));
      maritalStatus = folded?.[1];
    }
    if (!maritalStatus) fail("maritalStatus", "unknown");
  }

  const branchId = cell("branch") ? lookup("branch", lookups.branches) : lookups.onlyBranchId;
  const departmentId = lookup("department", lookups.departments);
  const scheduleId = lookup("schedule", lookups.schedules);
  const hireDate = date("hireDate");
  const birthDate = date("birthDate");

  const salary: ParsedImportRow["salary"] = {};
  for (const [k, type] of SALARY) {
    if (!cell(k)) continue;
    const halalas = parseImportAmount(cell(k));
    if (halalas === null) fail(k, "invalid_amount");
    else if (halalas !== "0") salary[type] = halalas;
  }

  const candidate = {
    ...(cell("employeeNo") ? { employeeNo: normalizeDigits(cell("employeeNo")) } : {}),
    fullNameAr: cell("fullNameAr"),
    fullNameEn: cell("fullNameEn"),
    nationalId: cell("nationalId"),
    nationality: nationality ?? "",
    isSaudi: nationality === "SA",
    jobTitle: cell("jobTitle") || null,
    departmentId: departmentId ?? null,
    branchId: branchId ?? null,
    scheduleId: scheduleId ?? null,
    hireDate: hireDate ?? "",
    status: "active" as const,
    ...(gender ? { gender } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(maritalStatus ? { maritalStatus } : {}),
    ...(cell("phone") ? { phone: normalizeDigits(cell("phone")) } : {}),
    ...(cell("additionalPhone") ? { additionalPhone: normalizeDigits(cell("additionalPhone")) } : {}),
    ...(cell("personalEmail") ? { personalEmail: cell("personalEmail") } : {}),
    ...(cell("iban") ? { iban: cell("iban") } : {}),
  };
  const parsed = CreateEmployeeSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const column = FIELD_COLUMN[String(issue.path[0])] ?? "row";
      // A required cell that was empty already says so; don't add "invalid" on top.
      if (column !== "row" && errors.some((e) => e.column === column)) continue;
      fail(column, "invalid");
    }
  }
  if (birthDate && hireDate && birthDate >= hireDate) fail("birthDate", "after_hire");

  return {
    input: errors.length === 0 && parsed.success ? parsed.data : null,
    managerNo: cell("managerNo") ? normalizeDigits(cell("managerNo")) : null,
    salary,
    errors,
  };
}

/**
 * Order rows so a manager listed in the same file is created before the people who report to them.
 * Returns the row indexes in creation order, or the indexes caught in a manager loop.
 */
export function orderByManager(rows: Array<{ employeeNo: string | null; managerNo: string | null }>): { order: number[]; cycle: number[] } {
  const byNo = new Map<string, number>();
  rows.forEach((r, i) => r.employeeNo && byNo.set(r.employeeNo, i));
  const state = new Array<0 | 1 | 2>(rows.length).fill(0); // 0 new, 1 visiting, 2 done
  const order: number[] = [];
  const cycle = new Set<number>();
  const visit = (i: number, path: number[]): void => {
    if (state[i] === 2) return;
    if (state[i] === 1) {
      for (const j of path.slice(path.indexOf(i))) cycle.add(j);
      return;
    }
    state[i] = 1;
    const managerNo = rows[i]?.managerNo;
    const m = managerNo ? byNo.get(managerNo) : undefined;
    if (m !== undefined && m !== i) visit(m, [...path, i]);
    state[i] = 2;
    order.push(i);
  };
  rows.forEach((_, i) => visit(i, []));
  return { order: order.filter((i) => !cycle.has(i)), cycle: [...cycle] };
}
