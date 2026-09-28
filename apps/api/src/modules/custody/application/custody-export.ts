import ExcelJS from "exceljs";
import type { CustodyDto } from "./custody.service";

/**
 * Techno Link custody export (business-rules.md "Techno Link export"). The exact column layout is
 * TBD with the accountant — this file is the ONE place to change it.
 */
const COLUMNS: Array<{ header: string; width: number; value: (c: CustodyDto) => string | number }> = [
  { header: "تاريخ الصرف / Paid on", width: 14, value: (c) => (c.paidAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(c.paidAt)) : "") },
  { header: "مرجع تكنو لينك / Techno Link ref", width: 22, value: (c) => c.technoLinkRef ?? "" },
  { header: "الرقم الوظيفي / Employee no.", width: 18, value: (c) => c.employee?.employeeNo ?? "" },
  { header: "الاسم / Name", width: 28, value: (c) => c.employee?.fullNameAr ?? "" },
  { header: "الغرض / Purpose", width: 36, value: (c) => c.purpose },
  { header: "المبلغ المصروف / Paid (SAR)", width: 18, value: (c) => Number(c.amountHalalas) / 100 },
  { header: "الحالة / Status", width: 14, value: (c) => (c.status === "settled" ? "مسوّاة / settled" : "مصروفة / paid") },
  { header: "المبلغ المسوّى / Settled (SAR)", width: 18, value: (c) => (c.settledAmountHalalas === null ? "" : Number(c.settledAmountHalalas) / 100) },
];

export async function buildCustodyWorkbook(rows: CustodyDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0);
  const sheet = workbook.addWorksheet("Custody", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width }));
  for (const row of rows) sheet.addRow(Object.fromEntries(COLUMNS.map((c, i) => [`c${i}`, c.value(row)])));
  sheet.getRow(1).font = { bold: true };
  for (const key of ["F", "H"]) sheet.getColumn(key).numFmt = "#,##0.00";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
