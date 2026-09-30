import type { DataScope } from "../../../../shared/access/access-rules";
import type { AttendanceCorrection, AttendanceDay, AttendancePunch, AttendanceStatus, PunchKind, Prisma } from "@prisma/client";

export const ATTENDANCE_REPOSITORY = Symbol("ATTENDANCE_REPOSITORY");

export interface DaySummaryData {
  status: AttendanceStatus | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  lateMin: number;
  workedMin: number;
  missingCheckout: boolean;
  corrected?: boolean;
}

export interface CreatePunchData {
  employeeId: string;
  attendanceDayId: string | null;
  kind: PunchKind;
  at: Date;
  lat: number;
  lng: number;
  accuracyM: number;
  distanceM: number | null;
  accepted: boolean;
  rejectReason: string | null;
  deviceInfo: string | null;
}

export type DayWithDetail = AttendanceDay & { punches: AttendancePunch[]; corrections: AttendanceCorrection[] };

export interface AttendanceRepositoryPort {
  /** Gets or creates the day row and locks it until the surrounding transaction ends (serializes punches). */
  /** Creates the day with the employee's current branch as its snapshot (ADR-0012); an existing day keeps its own. */
  lockOrCreateDay(companyId: string, employee: { id: string; branchId: string | null }, workDate: Date): Promise<AttendanceDay>;
  findDay(companyId: string, employeeId: string, workDate: Date): Promise<AttendanceDay | null>;
  findDayWithDetail(companyId: string, id: string): Promise<DayWithDetail | null>;
  acceptedPunches(companyId: string, attendanceDayId: string): Promise<AttendancePunch[]>;
  createPunch(companyId: string, data: CreatePunchData): Promise<AttendancePunch>;
  updateDay(companyId: string, id: string, data: DaySummaryData): Promise<AttendanceDay>;
  /** Records an approved short-permission excuse and the day's resulting lateness/status. */
  setExcuse(companyId: string, id: string, data: { excusedMin: number; lateMin: number; status: AttendanceDay["status"] }): Promise<void>;
  /** `scope` filters by each day's own branch snapshot (ADR-0012); `branchId` narrows to one branch. */
  listDays(companyId: string, filter: { from: Date; to: Date; employeeIds?: string[]; scope?: DataScope; branchId?: string }): Promise<AttendanceDay[]>;
  createCorrection(
    companyId: string,
    data: { attendanceDayId: string; oldValues: Prisma.InputJsonValue; newValues: Prisma.InputJsonValue; reason: string; correctedBy: string },
  ): Promise<AttendanceCorrection>;
}
