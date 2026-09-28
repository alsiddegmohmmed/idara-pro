import ExcelJS from "exceljs";
import type { ReportDayRow, ReportRow } from "./attendance-queries.service";

// Bilingual headers: the file is read by HR in Arabic and may be shared with the accountant.
const STATUS_AR: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  leave: "إجازة",
  holiday: "عطلة رسمية",
  weekend: "عطلة أسبوعية",
};

const hours = (min: number): number => Math.round((min / 60) * 100) / 100;
const riyadhTime = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))
    : "";

/** Monthly attendance workbook: "Summary" (one row per employee) and "Days" (one row per day). */
export async function buildAttendanceWorkbook(month: string, rows: ReportRow[], days: ReportDayRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0); // deterministic output; the month is in the sheet itself

  const summary = workbook.addWorksheet("Summary", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  summary.columns = [
    { header: "الرقم الوظيفي / Employee no.", key: "employeeNo", width: 18 },
    { header: "الاسم / Name", key: "name", width: 30 },
    { header: "Name (EN)", key: "nameEn", width: 28 },
    { header: "أيام العمل / Working days", key: "workingDays", width: 14 },
    { header: "حاضر / Present", key: "present", width: 12 },
    { header: "متأخر / Late", key: "late", width: 12 },
    { header: "غائب / Absent", key: "absent", width: 12 },
    { header: "إجازة / Leave", key: "leave", width: 12 },
    { header: "دقائق التأخير / Late minutes", key: "lateMin", width: 16 },
    { header: "ساعات العمل / Worked hours", key: "workedHours", width: 16 },
    { header: "بدون تسجيل خروج / Missing check-out", key: "missingCheckouts", width: 20 },
  ];
  for (const r of rows) {
    summary.addRow({
      employeeNo: r.employee.employeeNo,
      name: r.employee.fullNameAr,
      nameEn: r.employee.fullNameEn,
      workingDays: r.workingDays,
      present: r.present,
      late: r.late,
      absent: r.absent,
      leave: r.leave,
      lateMin: r.lateMin,
      workedHours: hours(r.workedMin),
      missingCheckouts: r.missingCheckouts,
    });
  }

  const daily = workbook.addWorksheet("Days", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  daily.columns = [
    { header: "التاريخ / Date", key: "date", width: 12 },
    { header: "الرقم الوظيفي / Employee no.", key: "employeeNo", width: 18 },
    { header: "الاسم / Name", key: "name", width: 30 },
    { header: "الحالة / Status", key: "status", width: 16 },
    { header: "الدخول / In", key: "in", width: 10 },
    { header: "الخروج / Out", key: "out", width: 10 },
    { header: "دقائق التأخير / Late min", key: "lateMin", width: 14 },
    { header: "ساعات العمل / Worked h", key: "workedHours", width: 14 },
    { header: "ملاحظات / Notes", key: "notes", width: 24 },
  ];
  for (const { employee, day } of days) {
    daily.addRow({
      date: day.workDate,
      employeeNo: employee.employeeNo,
      name: employee.fullNameAr,
      status: day.status ? `${STATUS_AR[day.status] ?? day.status} / ${day.status}` : "",
      in: riyadhTime(day.firstInAt),
      out: riyadhTime(day.lastOutAt),
      lateMin: day.lateMin,
      workedHours: hours(day.workedMin),
      notes: [day.missingCheckout ? "بدون خروج / missing check-out" : "", day.corrected ? "مُعدَّل / corrected" : ""]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const sheet of [summary, daily]) {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7F9" } };
  }
  summary.getCell("A1").note = `Attendance ${month}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
