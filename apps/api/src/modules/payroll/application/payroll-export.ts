import ExcelJS from "exceljs";
import type { PayrollItemView } from "@idara-pro/shared";

/**
 * Techno Link payroll export (business-rules.md "Techno Link export"). The exact layout is TBD with the
 * accountant — this file is the ONE place to change it. Amounts are SAR with 2 decimals, computed from
 * integer halalas (the division happens only here, for display in the sheet).
 */
const sar = (halalas: string): number => {
  const v = BigInt(halalas);
  const sign = v < 0n ? -1 : 1;
  const abs = v < 0n ? -v : v;
  return sign * (Number(abs / 100n) + Number(abs % 100n) / 100);
};

const deductionsOf = (i: PayrollItemView): bigint =>
  BigInt(i.absenceHalalas) + BigInt(i.latenessHalalas) + BigInt(i.unpaidLeaveHalalas) + BigInt(i.tieredLeaveHalalas) + BigInt(i.deductionsHalalas);

const EMPLOYEE_COLUMNS: Array<{ header: string; width: number; value: (i: PayrollItemView) => string | number }> = [
  { header: "الرقم الوظيفي / Employee no.", width: 16, value: (i) => i.employee?.employeeNo ?? "" },
  { header: "الاسم / Name", width: 28, value: (i) => i.employee?.fullNameAr ?? "" },
  { header: "Name (EN)", width: 28, value: (i) => i.employee?.fullNameEn ?? "" },
  { header: "أيام مدفوعة / Paid days", width: 12, value: (i) => i.paidDays },
  { header: "الأساسي / Basic", width: 14, value: (i) => sar(i.basicHalalas) },
  { header: "السكن / Housing", width: 14, value: (i) => sar(i.housingHalalas) },
  { header: "النقل / Transport", width: 14, value: (i) => sar(i.transportHalalas) },
  { header: "بدلات أخرى / Other", width: 14, value: (i) => sar(i.otherHalalas) },
  { header: "الإجمالي / Gross", width: 14, value: (i) => sar(i.grossHalalas) },
  { header: "إضافات / Additions", width: 14, value: (i) => sar(i.additionsHalalas) },
  { header: "خصومات / Deductions", width: 14, value: (i) => sar(deductionsOf(i).toString()) },
  { header: "تأمينات (موظف) / GOSI employee", width: 16, value: (i) => sar(i.gosiEmployeeHalalas) },
  { header: "الصافي / Net", width: 14, value: (i) => sar(i.netHalalas) },
  { header: "تأمينات (منشأة) / GOSI employer", width: 16, value: (i) => sar(i.gosiEmployerHalalas) },
  { header: "الآيبان / IBAN", width: 30, value: () => "" },
];

/** Sheet "Summary": totals per expense category; sheet "Employees": one row per employee. */
export async function buildPayrollWorkbook(period: string, items: PayrollItemView[], ibans?: Map<string, string>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0);
  const total = (f: (i: PayrollItemView) => bigint): number => sar(items.reduce((acc, i) => acc + f(i), 0n).toString());

  const summary = workbook.addWorksheet("Summary", { views: [{ rightToLeft: true }] });
  summary.columns = [
    { header: `البند / Category — ${period}`, key: "k", width: 36 },
    { header: "المبلغ / Amount (SAR)", key: "v", width: 20 },
  ];
  const rows: Array<[string, number]> = [
    ["الرواتب الأساسية / Basic salaries", total((i) => BigInt(i.basicHalalas))],
    ["بدل السكن / Housing", total((i) => BigInt(i.housingHalalas))],
    ["بدل النقل / Transport", total((i) => BigInt(i.transportHalalas))],
    ["بدلات أخرى / Other allowances", total((i) => BigInt(i.otherHalalas))],
    ["إضافات (مكافآت وبدلات) / Additions", total((i) => BigInt(i.additionsHalalas))],
    ["خصومات / Deductions", total(deductionsOf)],
    ["تأمينات اجتماعية (حصة الموظف) / GOSI employee", total((i) => BigInt(i.gosiEmployeeHalalas))],
    ["تأمينات اجتماعية (حصة المنشأة) / GOSI employer", total((i) => BigInt(i.gosiEmployerHalalas))],
    ["صافي الرواتب / Net pay", total((i) => BigInt(i.netHalalas))],
    ["عدد الموظفين / Employees", items.length],
  ];
  for (const [k, v] of rows) summary.addRow({ k, v });
  summary.getRow(1).font = { bold: true };
  summary.getColumn("v").numFmt = "#,##0.00";

  const sheet = workbook.addWorksheet("Employees", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = EMPLOYEE_COLUMNS.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width }));
  for (const item of items) {
    const values = Object.fromEntries(EMPLOYEE_COLUMNS.map((c, i) => [`c${i}`, c.value(item)]));
    values[`c${EMPLOYEE_COLUMNS.length - 1}`] = ibans?.get(item.id) ?? "";
    sheet.addRow(values);
  }
  sheet.getRow(1).font = { bold: true };
  for (let col = 5; col <= 14; col += 1) sheet.getColumn(col).numFmt = "#,##0.00";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
