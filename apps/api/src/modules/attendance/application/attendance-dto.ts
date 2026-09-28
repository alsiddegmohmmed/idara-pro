import type { AttendanceDay, AttendancePunch } from "@prisma/client";

/** JSON shapes with ISO strings, so an idempotent replay returns exactly what the first call did. */
export interface AttendanceDayDto {
  id: string;
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  status: AttendanceDay["status"];
  firstInAt: string | null;
  lastOutAt: string | null;
  lateMin: number;
  workedMin: number;
  missingCheckout: boolean;
  corrected: boolean;
}

export interface PunchDto {
  id: string;
  kind: AttendancePunch["kind"];
  at: string;
  distanceM: number | null;
  accuracyM: number;
  accepted: boolean;
  rejectReason: string | null;
}

export function toDayDto(day: AttendanceDay): AttendanceDayDto {
  return {
    id: day.id,
    employeeId: day.employeeId,
    workDate: day.workDate.toISOString().slice(0, 10),
    status: day.status,
    firstInAt: day.firstInAt?.toISOString() ?? null,
    lastOutAt: day.lastOutAt?.toISOString() ?? null,
    lateMin: day.lateMin,
    workedMin: day.workedMin,
    missingCheckout: day.missingCheckout,
    corrected: day.corrected,
  };
}

export function toPunchDto(punch: AttendancePunch): PunchDto {
  return {
    id: punch.id,
    kind: punch.kind,
    at: punch.at.toISOString(),
    distanceM: punch.distanceM === null ? null : Math.round(punch.distanceM),
    accuracyM: Math.round(punch.accuracyM),
    accepted: punch.accepted,
    rejectReason: punch.rejectReason,
  };
}
