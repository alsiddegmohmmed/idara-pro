import { PERMISSIONS, type ShortLeaveAllowance, type ShortLeaveView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson } from "@/lib/api";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";

// Pieces shared by the الاستئذانات page and the review panel (ux-redesign-v2 §6, §2.1).

const KNOWN_ERRORS = ["overlap", "not_working_day", "too_old", "own_request", "not_pending", "out_of_scope", "employee_inactive"];

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const toHHMM = (minutes: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function useShortLeaveError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    if (!(e instanceof ApiError)) return t("shortleave.errors.failed");
    if (e.code === "shortleave.allowance_exceeded") return t("shortleave.errors.allowance_exceeded", { remaining: formatDuration(Number(e.details.remaining ?? 0)) });
    const key = KNOWN_ERRORS.find((k) => e.code === `shortleave.${k}`);
    return key ? t(`shortleave.errors.${key}`) : t("shortleave.errors.failed");
  };
}

/** "08:00 → 09:00 · 1:00" on one line, always left-to-right. */
export function Window({ r }: { r: Pick<ShortLeaveView, "fromTime" | "toTime" | "minutes"> }): React.JSX.Element {
  return (
    <bdi dir="ltr" className="whitespace-nowrap tabular-nums">
      {r.fromTime} → {r.toTime} · {formatDuration(r.minutes)}
    </bdi>
  );
}

/**
 * One employee's month as an approver sees it (GET /shortleave/allowance). With `requestId`, reach is
 * checked against the branch that request was filed in, like deciding it (ADR-0012).
 */
export function useEmployeeAllowance(employeeId: string | undefined, month: string, requestId?: string) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ["shortleave", "allowance", employeeId, month, requestId ?? ""],
    queryFn: () =>
      apiJson<ShortLeaveAllowance>(`/api/v1/shortleave/allowance?employeeId=${employeeId}&month=${month}${requestId ? `&requestId=${requestId}` : ""}`),
    enabled: Boolean(employeeId) && can(PERMISSIONS.SHORTLEAVE_READ),
  });
}

/** Used / pending / remaining of the month as one bar. */
export function AllowanceBar({ a, extraMinutes = 0 }: { a: ShortLeaveAllowance; extraMinutes?: number }): React.JSX.Element {
  const { t } = useTranslation();
  const total = Math.max(a.allowanceMinutes, 1);
  const pct = (m: number): string => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <div>
      <p className="text-dense text-ink">
        {t("shortleave.allowance.used", { used: formatDuration(a.usedMinutes), total: formatDuration(a.allowanceMinutes) })}
        {a.pendingMinutes > 0 && <span className="text-ink-muted"> · {t("shortleave.allowance.pending", { time: formatDuration(a.pendingMinutes) })}</span>}
      </p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-neutral-soft" aria-hidden>
        <span className="bg-primary" style={{ width: pct(a.usedMinutes) }} />
        <span className="bg-warning" style={{ width: pct(a.pendingMinutes) }} />
        {extraMinutes > 0 && <span className="bg-primary/40" style={{ width: pct(extraMinutes) }} />}
      </div>
    </div>
  );
}

/**
 * The working day as a strip with the requested window on it (ux-redesign-v2 §2.1 "mini timeline").
 * Without a schedule it falls back to 07:00–18:00 so the window still has context.
 */
export function DayTimeline({ schedule, from, to }: { schedule: { startTime: string; endTime: string } | null; from: string; to: string }): React.JSX.Element {
  const { t } = useTranslation();
  // Same-day schedules only (v1); anything else falls back to the plain 07:00–18:00 strip.
  const usable = schedule && toMinutes(schedule.endTime) > toMinutes(schedule.startTime) ? schedule : null;
  const start = usable ? toMinutes(usable.startTime) : 7 * 60;
  const end = usable ? toMinutes(usable.endTime) : 18 * 60;
  const lo = Math.min(start, toMinutes(from));
  const hi = Math.max(end, toMinutes(to));
  const span = Math.max(hi - lo, 1);
  const at = (m: number): string => `${((m - lo) / span) * 100}%`;
  return (
    <div>
      <div className="relative h-8 overflow-hidden rounded-control bg-neutral-soft" dir="ltr">
        <span className="absolute inset-y-0 rounded-control bg-success-soft" style={{ left: at(start), width: `${((end - start) / span) * 100}%` }} />
        <span
          className={cn("absolute inset-y-1 rounded-control bg-warning")}
          style={{ left: at(toMinutes(from)), width: `${Math.max(((toMinutes(to) - toMinutes(from)) / span) * 100, 1)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-meta tabular-nums text-ink-muted" dir="ltr">
        <span>{toHHMM(lo)}</span>
        <span>{usable ? `${usable.startTime} – ${usable.endTime}` : t("shortleave.noSchedule")}</span>
        <span>{toHHMM(hi)}</span>
      </div>
    </div>
  );
}
