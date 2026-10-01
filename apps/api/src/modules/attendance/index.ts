export { AttendanceModule } from "./attendance.module";
export { AttendanceTotalsService, type AttendanceTotals } from "./application/attendance-totals.service";
// Worker-only — only worker.module.ts imports this.
export { AttendanceCloseJobModule } from "./attendance-close-job.module";
