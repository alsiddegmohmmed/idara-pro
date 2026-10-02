import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, type ImportColumnKey } from "@idara-pro/shared";
import { BusinessRuleError } from "../../../shared/errors/errors";
import type { ImportCells } from "../domain/employee-import";

/**
 * The employee import file. Sheet 1 "الموظفون" is filled in by HR (bilingual headers, one example row to
 * delete, dropdowns for gender / marital status / branch / department / schedule); sheet 2 "تعليمات"
 * explains every column; sheet 3 "القوائم" holds the dropdown values (this company's own names).
 */

const DATA_SHEET = "الموظفون";
const LISTS_SHEET = "القوائم";

const HELP: Record<ImportColumnKey, { ar: string; en: string }> = {
  employeeNo: { ar: "اتركه فارغاً ليُعطى رقماً تلقائياً (E-0001…)، أو اكتب الرقم المعتمد لديكم.", en: "Leave empty for an automatic number, or use your existing one." },
  fullNameAr: { ar: "الاسم الكامل بالعربية.", en: "Full name in Arabic." },
  fullNameEn: { ar: "الاسم الكامل بالإنجليزية كما في الجواز/الإقامة.", en: "Full name in English as in the passport / iqama." },
  nationalId: { ar: "10 أرقام: تبدأ بـ 1 للسعودي (الهوية) أو 2 لغير السعودي (الإقامة). هو أيضاً اسم الدخول.", en: "10 digits: starts with 1 (Saudi ID) or 2 (iqama). Also the sign-in name." },
  nationality: { ar: "رمز الدولة (SA، EG، IN…) أو اسمها بالعربية أو الإنجليزية.", en: "Country code (SA, EG, IN…) or its name in Arabic or English." },
  gender: { ar: "ذكر أو أنثى.", en: "Male or female." },
  birthDate: { ar: "بصيغة YYYY-MM-DD أو DD/MM/YYYY.", en: "YYYY-MM-DD or DD/MM/YYYY." },
  maritalStatus: { ar: "أعزب، متزوج، مطلق، أرمل.", en: "Single, married, divorced, widowed." },
  phone: { ar: "مثل 0551234567.", en: "e.g. 0551234567." },
  additionalPhone: { ar: "اختياري.", en: "Optional." },
  personalEmail: { ar: "اختياري. الدعوة لإنشاء الحساب تُرسل لاحقاً من ملف الموظف.", en: "Optional. Account invitations are sent later from the record." },
  jobTitle: { ar: "كما تريده أن يظهر في الملف.", en: "As it should appear on the record." },
  department: { ar: "اسم القسم كما في «الإعدادات ← الأقسام» (القائمة في ورقة القوائم).", en: "Department name as in Setup (see the lists sheet)." },
  branch: { ar: "اسم الفرع. إن كان للشركة فرع واحد فاتركه فارغاً.", en: "Branch name. With a single branch, leave it empty." },
  schedule: { ar: "اسم جدول الدوام. فارغ = جدول الفرع الافتراضي.", en: "Work schedule name. Empty = the branch default." },
  managerNo: { ar: "الرقم الوظيفي للمدير المباشر — من الموجودين في النظام أو من نفس الملف.", en: "The direct manager's employee no. — existing or in this same file." },
  hireDate: { ar: "تاريخ مباشرة العمل. YYYY-MM-DD أو DD/MM/YYYY.", en: "First working day. YYYY-MM-DD or DD/MM/YYYY." },
  iban: { ar: "آيبان سعودي يبدأ بـ SA (24 خانة).", en: "Saudi IBAN starting with SA (24 characters)." },
  basicSalary: { ar: "الراتب الشهري بالريال، يسري من تاريخ التعيين.", en: "Monthly amount in SAR, effective from the hire date." },
  housingAllowance: { ar: "بالريال شهرياً. اتركه فارغاً إن لم يوجد.", en: "SAR per month. Leave empty if none." },
  transportAllowance: { ar: "بالريال شهرياً. اتركه فارغاً إن لم يوجد.", en: "SAR per month. Leave empty if none." },
};

export interface TemplateLists {
  branches: string[];
  departments: string[];
  schedules: string[];
}

/** The template with this company's branch / department / schedule names in the dropdowns. */
export async function buildImportTemplate(lists: TemplateLists): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0);

  const sheet = workbook.addWorksheet(DATA_SHEET, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: `${c.ar}${c.required ? " *" : ""} / ${c.en}`, key: c.key, width: Math.max(16, c.ar.length + 6) }));
  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };
  IMPORT_COLUMNS.forEach((c, i) => {
    header.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? "FFFDE2C2" : "FFE8F1F2" } };
    header.getCell(i + 1).note = `${HELP[c.key].ar}\n${HELP[c.key].en}`;
  });
  // One example row (grey, to delete) so the formats are obvious.
  const example = sheet.addRow(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example])));
  example.font = { color: { argb: "FF8A8F98" }, italic: true };
  // Text format for identifier-like columns so Excel keeps leading zeros and long numbers as typed.
  for (const key of ["employeeNo", "nationalId", "phone", "additionalPhone", "iban", "managerNo", "birthDate", "hireDate"] as const) {
    sheet.getColumn(key).numFmt = "@";
  }

  const help = workbook.addWorksheet("تعليمات", { views: [{ rightToLeft: true }] });
  help.columns = [
    { header: "العمود / Column", key: "column", width: 34 },
    { header: "إلزامي / Required", key: "required", width: 12 },
    { header: "الشرح", key: "ar", width: 70 },
    { header: "Notes", key: "en", width: 60 },
  ];
  help.getRow(1).font = { bold: true };
  help.addRow({ column: "قبل البدء / Before you start", required: "", ar: "احذف سطر المثال الرمادي. سطر واحد لكل موظف. لا تغيّر عناوين الأعمدة. يُفحص الملف كاملاً قبل الحفظ، ولا يُحفظ شيء إن وُجد خطأ في أي سطر.", en: "Delete the grey example row. One row per employee. Keep the headers. The whole file is checked first; nothing is saved if any row has an error." });
  for (const c of IMPORT_COLUMNS) help.addRow({ column: `${c.ar} / ${c.en}`, required: c.required ? "نعم / Yes" : "", ar: HELP[c.key].ar, en: HELP[c.key].en });
  help.getColumn("ar").alignment = { wrapText: true, vertical: "top" };
  help.getColumn("en").alignment = { wrapText: true, vertical: "top" };

  const listSheet = workbook.addWorksheet(LISTS_SHEET, { views: [{ rightToLeft: true }] });
  const columns: Array<[string, string[]]> = [
    ["الجنس / Gender", ["ذكر", "أنثى"]],
    ["الحالة الاجتماعية / Marital status", ["أعزب", "متزوج", "مطلق", "أرمل"]],
    ["الفروع / Branches", lists.branches],
    ["الأقسام / Departments", lists.departments],
    ["جداول الدوام / Schedules", lists.schedules],
  ];
  columns.forEach(([title, values], i) => {
    const col = listSheet.getColumn(i + 1);
    col.width = 28;
    listSheet.getCell(1, i + 1).value = title;
    listSheet.getCell(1, i + 1).font = { bold: true };
    values.forEach((v, j) => (listSheet.getCell(j + 2, i + 1).value = v));
  });
  const letter = (i: number): string => String.fromCharCode(65 + i);
  const dropdown = (key: ImportColumnKey, listIndex: number, count: number): void => {
    if (count === 0) return;
    const col = IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
    const range = `'${LISTS_SHEET}'!$${letter(listIndex)}$2:$${letter(listIndex)}$${count + 1}`;
    for (let r = 2; r <= IMPORT_MAX_ROWS + 1; r++) {
      // Not strict: an unlisted value is reported by the dry run with a clear message instead.
      sheet.getCell(r, col).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [range] };
    }
  };
  dropdown("gender", 0, 2);
  dropdown("maritalStatus", 1, 4);
  dropdown("branch", 2, lists.branches.length);
  dropdown("department", 3, lists.departments.length);
  dropdown("schedule", 4, lists.schedules.length);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A cell as text the row parser understands (dates become YYYY-MM-DD, formulas their result). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

/**
 * Which column a header is: the template's "عربي * / English", or just the Arabic or English label, or the
 * key. Labels can contain "/" themselves (رقم الهوية / الإقامة), so match whole labels, longest first.
 */
const headerKey = (text: string): ImportColumnKey | undefined => {
  const clean = (s: string): string => s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const t = clean(text);
  const hits = IMPORT_COLUMNS.filter((c) => t === clean(c.key) || t.includes(clean(c.ar)) || t.includes(clean(c.en)));
  return hits.sort((a, b) => Math.max(b.ar.length, b.en.length) - Math.max(a.ar.length, a.en.length))[0]?.key;
};

/** Reads the filled-in sheet: one entry per non-empty row, with its spreadsheet row number. */
export async function readImportFile(buffer: Buffer): Promise<Array<{ row: number; cells: ImportCells }>> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS types predate Node's generic Buffer; hand it the exact bytes as an ArrayBuffer.
    await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  } catch {
    throw new BusinessRuleError("employees.import.not_excel", "The file is not an Excel workbook (.xlsx)");
  }
  const sheet = workbook.getWorksheet(DATA_SHEET) ?? workbook.worksheets[0];
  if (!sheet) throw new BusinessRuleError("employees.import.empty", "The workbook has no sheets");

  const columns = new Map<number, ImportColumnKey>();
  sheet.getRow(1).eachCell((cell, col) => {
    const key = headerKey(cellText(cell.value));
    if (key) columns.set(col, key);
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && ![...columns.values()].includes(c.key));
  if (missing.length > 0) {
    throw new BusinessRuleError("employees.import.missing_columns", "Required columns are missing", { columns: missing.map((c) => c.key) });
  }

  const rows: Array<{ row: number; cells: ImportCells }> = [];
  const exampleNationalId = IMPORT_COLUMNS.find((c) => c.key === "nationalId")?.example;
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1) return;
    const cells: ImportCells = {};
    columns.forEach((key, col) => {
      const text = cellText(row.getCell(col).value).trim();
      if (text) cells[key] = text;
    });
    if (Object.keys(cells).length === 0) return;
    // The template's example row left in place: skip it rather than import a fake person.
    if (cells.nationalId === exampleNationalId && cells.fullNameAr === IMPORT_COLUMNS[1].example) return;
    rows.push({ row: number, cells });
  });
  if (rows.length === 0) throw new BusinessRuleError("employees.import.empty", "No employee rows found");
  if (rows.length > IMPORT_MAX_ROWS) throw new BusinessRuleError("employees.import.too_many_rows", "Too many rows", { max: IMPORT_MAX_ROWS });
  return rows;
}
