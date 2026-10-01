import { LogIn, LogOut, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatDuration, formatLongDate, formatTime, todayInRiyadh } from "@/lib/dates";
import { useMyDays, useToday } from "../api";
import { usePunch } from "../use-punch";
import { AttendanceBadge } from "../status-badge";
import { MonthPicker } from "@/components/ui/date-picker";

/** In → out pairs of the day, in order; the last one is open while the employee is checked in. */
function sessionsOf(punches: Array<{ id: string; kind: "in" | "out"; at: string }>): Array<{ id: string; in: string; out: string | null }> {
  const sessions: Array<{ id: string; in: string; out: string | null }> = [];
  for (const p of punches) {
    if (p.kind === "in") sessions.push({ id: p.id, in: p.at, out: null });
    else {
      const open = sessions.at(-1);
      if (open && open.out === null) open.out = p.at;
    }
  }
  return sessions;
}

/** Minutes worked so far: closed sessions plus the open one up to `now` (break time between sessions excluded). */
function workedSoFar(sessions: Array<{ in: string; out: string | null }>, now: number): number {
  return Math.floor(sessions.reduce((ms, x) => ms + Math.max(0, (x.out ? Date.parse(x.out) : now) - Date.parse(x.in)), 0) / 60_000);
}

/** Re-renders every minute so the running worked time stays current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const monthBounds = (month: string): { from: string; to: string } => {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/** ui-spec: employees mostly on phones — one big action, clear result, history below. */
export function MyAttendancePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const today = useToday();
  const { punch: doPunch, pending: punching, phase, error } = usePunch();
  const [month, setMonth] = useState(() => todayInRiyadh().slice(0, 7));
  const { from, to } = monthBounds(month);
  const history = useMyDays(from, to);

  const now = useNow();
  const sessions = sessionsOf(today.data?.punches ?? []);
  const lastSession = sessions.at(-1) ?? null;
  const lastKind = today.data?.punches.at(-1)?.kind ?? null;
  const nextKind: "in" | "out" = lastKind === "in" ? "out" : "in";

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
            {/* A day can have several in → out sessions (out for an errand, back again): show where things stand now. */}
            <dl className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div>
                <dt className="text-meta text-ink-muted">{t("attendance.firstIn")}</dt>
                <dd className="text-page-title tabular-nums">
                  <bdi>{formatTime(day?.firstInAt ?? null)}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{lastKind === "in" ? t("attendance.inSince") : t("attendance.outSince")}</dt>
                <dd className="text-page-title tabular-nums">
                  <bdi>{formatTime(lastSession ? (lastKind === "in" ? lastSession.in : lastSession.out) : null)}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{t("attendance.workedToday")}</dt>
                <dd className="text-page-title tabular-nums">
                  <bdi dir="ltr">{formatDuration(workedSoFar(sessions, now))}</bdi>
                </dd>
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
              loading={punching}
              onClick={() => doPunch(nextKind)}
            >
              {nextKind === "in" ? t("attendance.checkIn") : t("attendance.checkOut")}
            </Button>
            <p className="flex items-center justify-center gap-2 text-meta text-ink-muted" aria-live="polite">
              <MapPin className={phase === "locating" ? "size-4 animate-pulse text-primary" : "size-4"} aria-hidden="true" />
              {phase === "locating" ? t("attendance.locating") : phase === "sending" ? t("attendance.sending") : t("attendance.locationNote")}
            </p>
            {sessions.length > 0 && (
              <div className="border-t border-line pt-3">
                <h3 className="mb-1 text-meta font-medium text-ink-muted">{t("attendance.sessions")}</h3>
                <ul className="divide-y divide-line">
                  {sessions.map((x, i) => (
                    <li key={x.id} className="flex items-center justify-between py-2 text-dense">
                      <span>{t("attendance.sessionN", { n: i + 1 })}</span>
                      <span className="tabular-nums text-ink-muted">
                        <bdi dir="ltr">
                          {formatTime(x.in)} → {x.out ? formatTime(x.out) : t("attendance.now")}
                        </bdi>
                        {" · "}
                        <bdi dir="ltr">{formatDuration(workedSoFar([x], now))}</bdi>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-section">{t("attendance.history")}</h2>
          <MonthPicker value={month} max={todayInRiyadh().slice(0, 7)} onChange={setMonth} />
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
