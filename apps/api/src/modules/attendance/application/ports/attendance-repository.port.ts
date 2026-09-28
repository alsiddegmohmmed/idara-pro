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
  lockOrCreateDay(companyId: string, employeeId: string, workDate: Date): Promise<AttendanceDay>;
  findDay(companyId: string, employeeId: string, workDate: Date): Promise<AttendanceDay | null>;
  findDayWithDetail(companyId: string, id: string): Promise<DayWithDetail | null>;
  acceptedPunches(companyId: string, attendanceDayId: string): Promise<AttendancePunch[]>;
  createPunch(companyId: string, data: CreatePunchData): Promise<AttendancePunch>;
  updateDay(companyId: string, id: string, data: DaySummaryData): Promise<AttendanceDay>;
  listDays(companyId: string, filter: { from: Date; to: Date; employeeIds?: string[] }): Promise<AttendanceDay[]>;
  createCorrection(
    companyId: string,
    data: { attendanceDayId: string; oldValues: Prisma.InputJsonValue; newValues: Prisma.InputJsonValue; reason: string; correctedBy: string },
  ): Promise<AttendanceCorrection>;
}
