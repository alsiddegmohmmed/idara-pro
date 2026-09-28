import type { AttendanceStatusCode } from "@idara-pro/shared";
import type { PunchKindCode } from "./punch-rules";
import { localTimeToInstant, type DayKind, type ScheduleTimes } from "./work-calendar";

export interface PunchTime {
  kind: PunchKindCode;
  at: Date;
}

export interface DaySummary {
  /** null = a working day that is still open with no punch yet. */
  status: AttendanceStatusCode | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  lateMin: number;
  workedMin: number;
  missingCheckout: boolean;
}

/** `late_minutes = max(0, first_check_in − (schedule.start + late_grace_min))` (business-rules.md). */
export function lateMinutes(firstInAt: Date, workDate: Date, schedule: ScheduleTimes | null, timeZone: string): number {
  if (!schedule) return 0; // no schedule → nothing to be late for
  const due = localTimeToInstant(workDate, schedule.startTime, timeZone).getTime() + schedule.lateGraceMin * 60_000;
  return Math.max(0, Math.floor((firstInAt.getTime() - due) / 60_000));
}

/**
 * Derives a day's figures from its accepted punches (sorted or not). `closed` = the day is over (the
 * nightly job): an unpunched working day becomes absent and a dangling check-in is flagged.
 */
export function summarizeDay(input: {
  punches: PunchTime[];
  workDate: Date;
  kind: DayKind;
  schedule: ScheduleTimes | null;
  timeZone: string;
  closed: boolean;
}): DaySummary {
  const punches = [...input.punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstIn = punches.find((p) => p.kind === "in")?.at ?? null;
  const lastOut = [...punches].reverse().find((p) => p.kind === "out")?.at ?? null;

  let workedMs = 0;
  let openSince: Date | null = null;
  for (const p of punches) {
    if (p.kind === "in" && !openSince) openSince = p.at;
    else if (p.kind === "out" && openSince) {
      workedMs += p.at.getTime() - openSince.getTime();
      openSince = null;
    }
  }

  const base = {
    firstInAt: firstIn,
    // While checked in (last punch is an "in"), there is no current check-out to show.
    lastOutAt: openSince === null ? lastOut : null,
    workedMin: Math.floor(workedMs / 60_000),
    missingCheckout: input.closed && openSince !== null,
  };

  if (input.kind !== "working") return { ...base, status: input.kind, lateMin: 0 };
  if (!firstIn) return { ...base, status: input.closed ? "absent" : null, lateMin: 0 };
  const lateMin = lateMinutes(firstIn, input.workDate, input.schedule, input.timeZone);
  return { ...base, status: lateMin > 0 ? "late" : "present", lateMin };
}
