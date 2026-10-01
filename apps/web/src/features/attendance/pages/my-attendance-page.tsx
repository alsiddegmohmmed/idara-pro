import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatDuration, formatLongDate, formatTime, todayInRiyadh } from "@/lib/dates";
import { useMyDays, useToday } from "../api";
import { AttendanceBadge } from "../status-badge";

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

const monthBounds = (month: string): { from: string; to: string } => {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/** ui-spec: employees mostly on phones — one big action, clear result, history below. */
export function MyAttendancePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const today = useToday();
  const [error, setError] = useState<string | null>(null);
  // GPS can take up to 20 s indoors: say what is happening so nobody taps twice or leaves.
  const [phase, setPhase] = useState<"locating" | "sending" | null>(null);
  const [month, setMonth] = useState(() => todayInRiyadh().slice(0, 7));
  const { from, to } = monthBounds(month);
  const history = useMyDays(from, to);

  const lastKind = today.data?.punches.at(-1)?.kind ?? null;
  const nextKind: "in" | "out" = lastKind === "in" ? "out" : "in";

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

  const punch = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      setPhase("locating");
      const position = await currentPosition();
      setPhase("sending");
      const body = jsonBody({ kind, ...position, deviceInfo: navigator.userAgent.slice(0, 300) });
      // One key per attempt: a retry after a dropped connection sends the same key and body,
      // so the punch counts once even if the first request did reach the server.
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

  const day = today.data?.day ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("attendance.myTitle")} description={formatLongDate(new Date(), i18n.language)} />

      <Panel>
        <PanelHeader
          title={t("attendance.today")}
          actions={today.data && <AttendanceBadge state={day?.status ?? (today.data.kind === "working" ? "not_yet" : today.data.kind)} />}
        />
        {today.isLoading && <Skeleton className="h-40" />}
        {today.isError && (
          <Alert>
            {today.error instanceof ApiError && today.error.code === "employees.no_linked_employee"
              ? t("attendance.errors.no_linked_employee")
              : t("common.loadFailed")}
          </Alert>
        )}
        {today.data && (
          <div className="space-y-6">
            {today.data.kind !== "working" && <Alert tone="info">{t(`attendance.offDay.${today.data.kind}`)}</Alert>}
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-meta text-ink-muted">{t("attendance.in")}</dt>
                <dd className="text-page-title tabular-nums">{formatTime(day?.firstInAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{t("attendance.out")}</dt>
                <dd className="text-page-title tabular-nums">{formatTime(day?.lastOutAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{t("attendance.lateMin")}</dt>
                <dd className="text-page-title tabular-nums">{day?.lateMin ?? 0}</dd>
              </div>
            </dl>
            {error && <Alert>{error}</Alert>}
            <Button
              size="lg"
              className="w-full"
              variant={nextKind === "in" ? "primary" : "secondary"}
              icon={nextKind === "in" ? <LogIn className="rtl:-scale-x-100" /> : <LogOut className="rtl:-scale-x-100" />}
              loading={punch.isPending}
              onClick={() => punch.mutate(nextKind)}
            >
              {nextKind === "in" ? t("attendance.checkIn") : t("attendance.checkOut")}
            </Button>
            <p className="flex items-center justify-center gap-2 text-meta text-ink-muted" aria-live="polite">
              <MapPin className={phase === "locating" ? "size-4 animate-pulse text-primary" : "size-4"} aria-hidden="true" />
              {phase === "locating" ? t("attendance.locating") : phase === "sending" ? t("attendance.sending") : t("attendance.locationNote")}
            </p>
            {today.data.punches.length > 0 && (
              <ul className="divide-y divide-line border-t border-line pt-2">
                {today.data.punches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-dense">
                    <span>{p.kind === "in" ? t("attendance.in") : t("attendance.out")}</span>
                    <span className="tabular-nums text-ink-muted">
                      <bdi>{formatTime(p.at)}</bdi>
                      {p.distanceM !== null && <> · {t("attendance.metersAway", { distance: p.distanceM })}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-section">{t("attendance.history")}</h2>
          <Input
            type="month"
            dir="ltr"
            value={month}
            max={todayInRiyadh().slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label={t("attendance.month")}
            className="w-40"
          />
        </div>
        {history.isLoading && <Skeleton className="h-40" />}
        {history.data && history.data.length === 0 && (
          <div className="rounded-panel border border-line bg-surface">
            <EmptyState message={t("attendance.noDays")} />
          </div>
        )}
        {history.data && history.data.length > 0 && (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>{t("attendance.date")}</TableHead>
                <TableHead>{t("employees.fields.status")}</TableHead>
                <TableHead>{t("attendance.in")}</TableHead>
                <TableHead>{t("attendance.out")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("attendance.worked")}</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {[...history.data].reverse().map((d) => (
                <TableRow key={d.id} dense>
                  <TableCell>
                    <bdi>{d.workDate}</bdi>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AttendanceBadge state={d.status} />
                      {d.missingCheckout && <span className="text-meta text-danger">{t("attendance.missingCheckout")}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <bdi>{formatTime(d.firstInAt)}</bdi>
                  </TableCell>
                  <TableCell>
                    <bdi>{formatTime(d.lastOutAt)}</bdi>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <bdi>{formatDuration(d.workedMin)}</bdi>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
