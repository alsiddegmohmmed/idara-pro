import { distanceMeters, type LatLng } from "./geo";

/** docs/domain/business-rules.md "Attendance": accepted only inside the branch radius with good GPS. */

export const DEFAULT_MAX_GPS_ACCURACY_M = 100;

export type PunchRejectReason = "gps_accuracy_too_low" | "outside_branch_radius";

export interface PunchEvaluation {
  accepted: boolean;
  distanceM: number;
  rejectReason: PunchRejectReason | null;
}

export function evaluatePunchLocation(
  position: LatLng & { accuracyM: number },
  branch: LatLng & { radiusM: number },
  maxAccuracyM: number,
): PunchEvaluation {
  const distanceM = distanceMeters(position, branch);
  // Accuracy first: with a poor fix the distance itself can't be trusted.
  if (position.accuracyM > maxAccuracyM) return { accepted: false, distanceM, rejectReason: "gps_accuracy_too_low" };
  if (distanceM > branch.radiusM) return { accepted: false, distanceM, rejectReason: "outside_branch_radius" };
  return { accepted: true, distanceM, rejectReason: null };
}

export type PunchKindCode = "in" | "out";

/** In and out must alternate within a day: in → out → in → out … */
export function punchSequenceError(lastKind: PunchKindCode | null, kind: PunchKindCode): "already_checked_in" | "not_checked_in" | null {
  if (kind === "in" && lastKind === "in") return "already_checked_in";
  if (kind === "out" && lastKind !== "in") return "not_checked_in";
  return null;
}
