import { PERMISSIONS, type ShortLeaveView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageCrumb } from "@/app/shell/crumb";
import { useAuth } from "@/features/auth";
import { useEmployee, useRefs } from "@/features/employees/api";
import { nameIn } from "@/features/employees/employee-name";
import { apiJson } from "@/lib/api";
import { formatDateTime, formatDuration, formatTime, todayInRiyadh } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useBoard, type AttendanceDay, type AttendanceStatus, type EmployeeRef, type Punch } from "../api";
import { CorrectionDialog, type CorrectionTarget } from "../correction-dialog";
import { AttendanceBadge } from "../status-badge";

// ux-redesign-v2 §3: "how does this person attend?" — one employee's month, opened from a row of الحضور.
// Prev/next walk the employees of the board you came from (?date=&branch= are carried in the URL).

interface DayRow {
  employee: EmployeeRef;
  day: AttendanceDay;
}

interface DayDetail {
  punches: Punch[];
  corrections: Array<{ id: string; reason: string; createdAt: string; newValues: Record<string, unknown> }>;
}

const CELL: Record<AttendanceStatus, string> = {
  present: "bg-success-soft text-success",
  late: "bg-warning-soft text-warning",
  absent: "bg-danger-soft text-danger",
  leave: "bg-info-soft text-info",
  holiday: "bg-neutral-soft text-ink-muted",
  weekend: "bg-neutral-soft text-ink-muted",
};

/** Every date of a month (YYYY-MM) and the weekday (0 = Sunday) of its first day. */
function monthDates(month: string): { dates: string[]; firstWeekday: number } {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  return { dates, firstWeekday: new Date(Date.UTC(y, m - 1, 1)).getUTCDay() };
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }): React.JSX.Element {
  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <p className="text-meta text-ink-muted">{label}</p>
      <p className="mt-1 text-section tabular-nums text-ink">{value}</p>
      {hint && <p className="text-meta text-ink-muted">{hint}</p>}
    </div>
  );
}

export function AttendancePersonPage(): React.JSX.Element {
  const { id } = useParams();
  // Another person is a fresh page: no selected day or dialog carries over.
  return <PersonMonth key={id} employeeId={id ?? ""} />;
}

/**
 * One employee's attendance month. `embedded` (inside the employee record) drops the page header and
 * the السابق / التالي walk — the record has its own.
 */
export function PersonMonth({ employeeId, embedded = false }: { employeeId: string; embedded?: boolean }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayInRiyadh();
  const month = params.get("month") ?? today.slice(0, 7);
  const boardDate = params.get("date") ?? "";
  const branchId = params.get("branch") ?? "";
  const { dates, firstWeekday } = monthDates(month);
  const [selected, setSelected] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null);

  const days = useQuery({
    queryKey: ["attendance", "days", employeeId, month],
    queryFn: () => apiJson<DayRow[]>(`/api/v1/attendance/days?from=${dates[0]}&to=${dates[dates.length - 1]}&employeeId=${employeeId}`),
    // Another month of the same person may keep the old grid briefly (dimmed); never another person's.
    enabled: Boolean(employeeId),
  });
  const shortLeave = useQuery({
    queryKey: ["shortleave", "list", "employee", employeeId],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests?employeeId=${employeeId}&status=approved`),
    enabled: Boolean(employeeId) && can(PERMISSIONS.SHORTLEAVE_READ),
  });
  // The list you came from, for السابق / التالي (cached from the board).
  const board = useBoard(boardDate, branchId, Boolean(boardDate) && !embedded);
  const branches = useRefs("branches");

  const byDate = useMemo(() => new Map((days.data ?? []).map((r) => [r.day.workDate.slice(0, 10), r.day])), [days.data]);
  // A month with no records still needs a header: fall back to the board row, then the employee record.
  const record = useEmployee(days.data && days.data.length === 0 && can(PERMISSIONS.EMPLOYEES_READ) ? employeeId : undefined);
  const employee: EmployeeRef | undefined =
    days.data?.[0]?.employee ??
    board.data?.rows.find((r) => r.employee.id === employeeId)?.employee ??
    (record.data && {
      id: record.data.id,
      employeeNo: record.data.employeeNo,
      fullNameAr: record.data.fullNameAr,
      fullNameEn: record.data.fullNameEn,
      jobTitle: record.data.jobTitle,
      branchId: record.data.branchId,
    }) ??
    undefined;
  usePageCrumb(employee ? nameIn(i18n, employee) : null, !embedded);

  const order = board.data?.rows.map((r) => r.employee.id) ?? [];
  const at = order.indexOf(employeeId);
  const go = (otherId: string | undefined): void => {
    if (!otherId) return;
    const next = new URLSearchParams(params);
    navigate({ pathname: `/attendance/people/${otherId}`, search: next.toString() }, { replace: true });
  };

  const list = [...byDate.values()];
  const count = (s: AttendanceStatus): number => list.filter((d) => d.status === s).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const rate = present + late + absent > 0 ? Math.round(((present + late) / (present + late + absent)) * 100) : null;
  const lateMin = list.reduce((sum, d) => sum + d.lateMin, 0);
  const permissions = (shortLeave.data ?? []).filter((r) => r.date.startsWith(month));
  const permissionMin = permissions.reduce((sum, r) => sum + r.minutes, 0);
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { weekday: "short", timeZone: "UTC" });
    // 2026-03-01 is a Sunday: the Saudi week starts on Sunday.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 2, 1 + i))));
  }, [i18n.language]);
  const branchName = employee?.branchId ? branches.data?.find((b) => b.id === employee.branchId)?.name : undefined;

  const correct = (date: string): void => {
    if (employee) setCorrecting({ employee, workDate: date, day: byDate.get(date) ?? null });
  };

  return (
    <div className="space-y-6">
      {!embedded && (
      <header className="flex flex-wrap items-center gap-4">
        {employee ? (
          <>
            <Avatar name={employee.fullNameAr} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-page-title text-ink">{nameIn(i18n, employee)}</h1>
              <p className="text-body text-ink-muted">
                {[employee.jobTitle, branchName].filter(Boolean).join(" · ")}
                {employee.jobTitle || branchName ? " · " : ""}
                <bdi>{employee.employeeNo}</bdi>
              </p>
              {can(PERMISSIONS.EMPLOYEES_READ) && (
                <Link to={`/employees/${employee.id}`} className="text-dense text-primary underline-offset-4 hover:underline">
                  {t("attendancePerson.fullProfile")}
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center gap-4">
            <Skeleton className="size-[72px] rounded-full" />
            <Skeleton className="h-7 w-56" />
          </div>
        )}
        {order.length > 1 && at >= 0 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={at <= 0} onClick={() => go(order[at - 1])}>
              <ChevronRight className="ltr:rotate-180" aria-hidden />
              {t("panel.previous")}
            </Button>
            <span className="text-meta tabular-nums text-ink-muted">{t("panel.position", { n: at + 1, total: order.length })}</span>
            <Button variant="ghost" size="sm" disabled={at >= order.length - 1} onClick={() => go(order[at + 1])}>
              {t("panel.next")}
              <ChevronLeft className="ltr:rotate-180" aria-hidden />
            </Button>
          </div>
        )}
      </header>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker
          value={month}
          max={today.slice(0, 7)}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("month", v);
            setSelected(null);
            setParams(next, { replace: true, preventScrollReset: true });
          }}
        />
      </div>

      {days.isError && <Alert>{t("common.loadFailed")}</Alert>}

      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", embedded ? "xl:grid-cols-5" : "lg:grid-cols-5")}>
        <Kpi label={t("attendancePerson.rate")} value={rate === null ? "—" : `${rate}%`} />
        <Kpi label={t("attendancePerson.lateDays")} value={late} hint={lateMin > 0 ? t("attendancePerson.lateMinutes", { duration: formatDuration(lateMin) }) : undefined} />
        <Kpi label={t("attendancePerson.absentDays")} value={absent} />
        <Kpi
          label={t("attendancePerson.permissions")}
          value={can(PERMISSIONS.SHORTLEAVE_READ) ? permissions.length : "—"}
          hint={permissionMin > 0 ? formatDuration(permissionMin) : undefined}
        />
        <Kpi label={t("attendancePerson.leaveDays")} value={count("leave")} />
      </div>

      <section aria-label={t("attendancePerson.calendar")} className={cn("rounded-panel border border-line bg-surface p-4", days.isPlaceholderData && "opacity-60")}>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {weekdays.map((w) => (
            <span key={w} className="pb-1 text-meta text-ink-muted">
              {w}
            </span>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {dates.map((date) => {
            const day = byDate.get(date);
            const future = date > today;
            const status = day?.status ?? null;
            return (
              <button
                key={date}
                type="button"
                disabled={future}
                aria-pressed={selected === date}
                aria-label={`${date} ${status ? t(`attendance.status.${status}`) : ""}`}
                onClick={() => setSelected(selected === date ? null : date)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-control text-dense tabular-nums transition-colors disabled:opacity-40",
                  status ? CELL[status] : "bg-canvas text-ink-muted",
                  selected === date && "ring-2 ring-primary",
                )}
              >
                <span className="font-medium">{Number(date.slice(8))}</span>
                {day && day.lateMin > 0 && <bdi dir="ltr" className="text-[11px] leading-none">+{day.lateMin}</bdi>}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-3 text-meta text-ink-muted">
          {(["present", "late", "absent", "leave", "holiday"] as const).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded-sm", CELL[s])} />
              {t(`attendance.status.${s}`)}
            </li>
          ))}
        </ul>
      </section>

      {selected && <SelectedDay date={selected} day={selectedDay} onCorrect={can(PERMISSIONS.ATTENDANCE_CORRECT) ? () => correct(selected) : undefined} />}

      {days.isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : list.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("attendance.noDays")} />
        </div>
      ) : (
        <Table busy={days.isPlaceholderData}>
          <TableHeader>
            <tr>
              <TableHead>{t("attendance.date")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
              <TableHead>{t("attendance.in")}</TableHead>
              <TableHead>{t("attendance.out")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("attendance.lateMin")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("attendance.worked")}</TableHead>
              {can(PERMISSIONS.ATTENDANCE_CORRECT) && (
                <TableHead className="w-24">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              )}
            </tr>
          </TableHeader>
          <TableBody>
            {[...list]
              .sort((a, b) => b.workDate.localeCompare(a.workDate))
              .map((d) => (
                <TableRow key={d.id} dense aria-current={selected === d.workDate.slice(0, 10) || undefined} onClick={() => setSelected(d.workDate.slice(0, 10))}>
                  <TableCell>
                    <bdi className="tabular-nums">{d.workDate.slice(0, 10)}</bdi>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AttendanceBadge state={d.status} />
                      {d.missingCheckout && <span className="text-meta text-danger">{t("attendance.missingCheckout")}</span>}
                      {d.corrected && <span className="text-meta text-ink-muted">{t("attendance.corrected")}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <bdi>{formatTime(d.firstInAt)}</bdi>
                  </TableCell>
                  <TableCell>
                    <bdi>{formatTime(d.lastOutAt)}</bdi>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{d.lateMin}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <bdi>{formatDuration(d.workedMin)}</bdi>
                  </TableCell>
                  {can(PERMISSIONS.ATTENDANCE_CORRECT) && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => correct(d.workDate.slice(0, 10))}>
                        {t("attendance.correction.action")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <CorrectionDialog target={correcting} onClose={() => setCorrecting(null)} />
    </div>
  );
}

/** A day picked on the calendar: its punches and any corrections, with the correction action. */
function SelectedDay({ date, day, onCorrect }: { date: string; day: AttendanceDay | undefined; onCorrect?: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const detail = useQuery({
    queryKey: ["attendance", "day", day?.id],
    queryFn: () => apiJson<DayDetail>(`/api/v1/attendance/days/${day?.id}`),
    enabled: Boolean(day),
    placeholderData: () => undefined,
  });
  return (
    <section className="rounded-panel border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-subsection text-ink">
          <bdi className="tabular-nums">{date}</bdi>
        </h2>
        <AttendanceBadge state={day?.status ?? null} />
        {onCorrect && (
          <Button variant="secondary" size="sm" icon={<Pencil />} className="ms-auto" onClick={onCorrect}>
            {t("attendance.correction.action")}
          </Button>
        )}
      </div>
      {!day ? (
        <p className="text-dense text-ink-muted">{t("attendancePerson.noRecord")}</p>
      ) : detail.isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-meta text-ink-muted">{t("attendancePerson.punches")}</h3>
            {(detail.data?.punches ?? []).length === 0 ? (
              <p className="text-dense text-ink-muted">—</p>
            ) : (
              <ul className="space-y-1 text-dense">
                {detail.data?.punches.map((p) => (
                  <li key={p.id} className={cn("flex items-center gap-2", !p.accepted && "text-ink-muted line-through")}>
                    <span className="w-14">{p.kind === "in" ? t("attendance.in") : t("attendance.out")}</span>
                    <bdi className="tabular-nums">{formatTime(p.at)}</bdi>
                    {p.distanceM !== null && <span className="text-meta text-ink-muted">{t("attendance.metersAway", { distance: p.distanceM })}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-meta text-ink-muted">{t("attendancePerson.corrections")}</h3>
            {(detail.data?.corrections ?? []).length === 0 ? (
              <p className="text-dense text-ink-muted">—</p>
            ) : (
              <ul className="space-y-1 text-dense">
                {detail.data?.corrections.map((c) => (
                  <li key={c.id}>
                    <bdi className="tabular-nums text-meta text-ink-muted">{formatDateTime(c.createdAt)}</bdi> · {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
