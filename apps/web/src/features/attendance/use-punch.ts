import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiJson, jsonBody } from "@/lib/api";

interface Position {
  lat: number;
  lng: number;
  accuracyM: number;
}

class LocationError extends Error {}

/** One high-accuracy fix; the server, not this page, decides whether it is inside the branch. */
function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new LocationError("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (e) => reject(new LocationError(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/**
 * Check in / out in place (dashboard and "My attendance"): location, then the punch, with a phase to show
 * ("finding your location…", "recording…") and an explained error. Retries once on a dropped connection
 * with the same Idempotency-Key, so a punch never counts twice.
 */
export function usePunch(): {
  punch: (kind: "in" | "out") => void;
  pending: boolean;
  phase: "locating" | "sending" | null;
  error: string | null;
} {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // GPS can take up to 20 s indoors: say what is happening so nobody taps twice or leaves.
  const [phase, setPhase] = useState<"locating" | "sending" | null>(null);

  function describe(e: unknown): string {
    if (e instanceof LocationError) return t(`attendance.location.${e.message}`);
    if (e instanceof ApiError) {
      const d = e.details;
      const n = (v: unknown): string => (typeof v === "number" ? v.toLocaleString("en-US") : "");
      switch (e.code) {
        case "attendance.punch.outside_branch_radius":
          return t("attendance.errors.outsideRadius", { distance: n(d.distanceM), radius: n(d.radiusM) });
        case "attendance.punch.gps_accuracy_too_low":
          return t("attendance.errors.lowAccuracy", { accuracy: n(d.accuracyM), max: n(d.maxAccuracyM) });
        case "attendance.punch.already_checked_in":
        case "attendance.punch.not_checked_in":
        case "attendance.no_branch":
        case "attendance.employee_inactive":
        case "employees.no_linked_employee":
          return t(`attendance.errors.${e.code.split(".").pop() ?? ""}`);
        default:
          return t("attendance.errors.failed");
      }
    }
    return t("attendance.errors.network");
  }

  const mutation = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      setPhase("locating");
      const position = await currentPosition();
      setPhase("sending");
      const body = jsonBody({ kind, ...position, deviceInfo: navigator.userAgent.slice(0, 300) });
      const init = { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, ...body };
      try {
        return await apiJson("/api/v1/attendance/punches", init);
      } catch (e) {
        if (e instanceof ApiError) throw e;
        await new Promise((r) => setTimeout(r, 1500));
        return apiJson("/api/v1/attendance/punches", init);
      }
    },
    onMutate: () => setError(null),
    onSettled: () => setPhase(null),
    onSuccess: (_data, kind) => {
      toast.success(kind === "in" ? t("attendance.checkedIn") : t("attendance.checkedOut"));
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => setError(describe(e)),
  });

  return { punch: (kind) => mutation.mutate(kind), pending: mutation.isPending, phase, error };
}
