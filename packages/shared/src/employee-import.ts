/**
 * Excel import of employees (roadmap Phase 5, one-time onboarding of a branch). One row per employee;
 * the template the API generates has these columns in this order, bilingual headers, dropdowns for the
 * fixed lists and an instructions sheet. Column keys are what the API and web refer to; headers are for
 * people (either the Arabic or the English header is recognised, so a re-saved sheet still imports).
 */
export const IMPORT_COLUMNS = [
  { key: "employeeNo", ar: "الرقم الوظيفي", en: "Employee no.", required: false, example: "E-0101" },
  { key: "fullNameAr", ar: "الاسم بالعربية", en: "Name (Arabic)", required: true, example: "محمد أحمد العتيبي" },
  { key: "fullNameEn", ar: "الاسم بالإنجليزية", en: "Name (English)", required: true, example: "Mohammed Ahmed Alotaibi" },
  { key: "nationalId", ar: "رقم الهوية / الإقامة", en: "National ID / Iqama", required: true, example: "1012345678" },
  { key: "nationality", ar: "الجنسية", en: "Nationality", required: true, example: "SA" },
  { key: "gender", ar: "الجنس", en: "Gender", required: false, example: "ذكر" },
  { key: "birthDate", ar: "تاريخ الميلاد", en: "Birth date", required: false, example: "1990-05-14" },
  { key: "maritalStatus", ar: "الحالة الاجتماعية", en: "Marital status", required: false, example: "متزوج" },
  { key: "phone", ar: "الجوال", en: "Mobile", required: false, example: "0551234567" },
  { key: "additionalPhone", ar: "رقم إضافي", en: "Other number", required: false, example: "" },
  { key: "personalEmail", ar: "البريد الشخصي", en: "Personal email", required: false, example: "m.alotaibi@example.com" },
  { key: "jobTitle", ar: "المسمى الوظيفي", en: "Job title", required: false, example: "محاسب" },
  { key: "department", ar: "القسم", en: "Department", required: false, example: "" },
  { key: "branch", ar: "الفرع", en: "Branch", required: false, example: "" },
  { key: "schedule", ar: "جدول الدوام", en: "Work schedule", required: false, example: "" },
  { key: "managerNo", ar: "الرقم الوظيفي للمدير المباشر", en: "Manager's employee no.", required: false, example: "" },
  { key: "hireDate", ar: "تاريخ التعيين", en: "Hire date", required: true, example: "2024-01-15" },
  { key: "iban", ar: "الآيبان", en: "IBAN", required: false, example: "SA0380000000608010167519" },
  { key: "basicSalary", ar: "الراتب الأساسي (ريال)", en: "Basic salary (SAR)", required: false, example: "6000" },
  { key: "housingAllowance", ar: "بدل السكن (ريال)", en: "Housing allowance (SAR)", required: false, example: "1500" },
  { key: "transportAllowance", ar: "بدل النقل (ريال)", en: "Transport allowance (SAR)", required: false, example: "500" },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

/** Values accepted in the gender and marital-status columns (Arabic or English, any case). */
export const IMPORT_GENDER_WORDS: Record<string, "male" | "female"> = {
  ذكر: "male", male: "male", m: "male",
  أنثى: "female", انثى: "female", female: "female", f: "female",
};
export const IMPORT_MARITAL_WORDS: Record<string, "single" | "married" | "divorced" | "widowed"> = {
  أعزب: "single", عزباء: "single", single: "single",
  متزوج: "married", متزوجة: "married", married: "married",
  مطلق: "divorced", مطلقة: "divorced", divorced: "divorced",
  أرمل: "widowed", أرملة: "widowed", widowed: "widowed",
};

/** Most rows a file may hold (one branch onboarding; larger files are split). */
export const IMPORT_MAX_ROWS = 1000;

export interface ImportRowError {
  /** The column key, or "row" for problems with the row as a whole. */
  column: ImportColumnKey | "row";
  /** i18n code under `employees.import.errors.*` on the web. */
  code: string;
}

export interface ImportRowResult {
  /** The spreadsheet row number (header is row 1). */
  row: number;
  status: "ready" | "error";
  name: string | null;
  employeeNo: string | null;
  errors: ImportRowError[];
}

export interface ImportReport {
  /** A dry run checks everything and saves nothing. */
  dryRun: boolean;
  total: number;
  ready: number;
  withErrors: number;
  /** Employees actually created (0 on a dry run, and 0 when any row has an error — all or nothing). */
  created: number;
  rows: ImportRowResult[];
}
