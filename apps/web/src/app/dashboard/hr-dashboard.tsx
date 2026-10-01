import { PERMISSIONS, type ContractEndingView, type PayrollRunView, type ShortLeaveView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard, type AttendanceDay, type EmployeeRef } from "@/features/attendance/api";
import { useAuth } from "@/features/auth";
import { useEmployees } from "@/features/employees/api";
import { nameIn } from "@/features/employees/employee-name";
import { useLeaveRequests } from "@/features/leave/api";
import { useTypeName } from "@/features/leave/leave-badge";
import { apiJson } from "@/lib/api";
import { formatDateRange, formatTime, ltr, todayInRiyadh } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import { useAttention, type AttentionKey } from "../attention";
import { ColumnTrend, type TrendPoint } from "./column-trend";
import { StatTile } from "./stat-tile";
import { StatusBar } from "./status-bar";

// ux-redesign-v2 §7 — the HR / manager home, in this order: what waits on me (one card, one button to
// start reviewing), today, who is out, what's coming in the next 30 days, this month's payroll, the trend.
// Every card reads endpoints that are already scoped to the viewer, so a manager sees their team.

interface ExpiringDocument {
  id: string;
  type: string;
  expiryDate: string;
  daysLeft: number;
  employee: { id: string; fullNameAr: string; fullNameEn: string };
}

const shiftDate = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const UPCOMING_DAYS = 30;
const INBOX_ORDER: AttentionKey[] = ["leave", "shortleave", "custody", "adjustments", "warnings", "reviews", "payroll"];

function PersonRow({
  employee,
  meta,
  badge,
  to,
}: {
  employee: { id: string; fullNameAr: string; fullNameEn: string };
  meta?: string;
  badge?: React.ReactNode;
  to?: string;
}): React.JSX.Element {
  const { i18n } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Avatar name={employee.fullNameAr} size="sm" />
      <Link to={to ?? `/employees/${employee.id}`} className="min-w-0 flex-1 hover:text-primary">
        <span className="block truncate text-dense font-medium">{nameIn(i18n, employee)}</span>
        {meta && <span className="block text-meta tabular-nums text-ink-muted">{meta}</span>}
      </Link>
      {badge}
    </li>
  );
}

/** 1. Everything waiting on me as one card: the count, a chip per kind, and "ابدأ المراجعة". */
function InboxCard({ withoutAccount }: { withoutAccount: number }): React.JSX.Element {
  const { t } = useTranslation();
  const { counts, total, isLoading } = useAttention();
  const kinds = INBOX_ORDER.filter((k) => counts[k] > 0);
  return (
    <Panel>
      {isLoading && total === 0 ? (
        <Skeleton className="h-16" />
      ) : total === 0 ? (
        <p className="flex items-center gap-2 text-body text-ink-muted">
          <CheckCircle2 className="size-5 text-success" strokeWidth={1.75} aria-hidden="true" />
          {t("home.nothingToDo")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-section text-ink">{t("home.inbox.waiting", { count: total })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {kinds.map((k) => (
                <span key={k} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-meta text-ink">
                  {t(`inbox.kinds.${k}`)}
                  <span className="tabular-nums text-ink-muted">{counts[k]}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" asChild>
              <Link to="/inbox">{t("home.viewAll")}</Link>
            </Button>
            <Button asChild>
              <Link to="/inbox?start=1">{t("panel.startReview")}</Link>
            </Button>
          </div>
        </div>
      )}
      {withoutAccount > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-dense text-ink-muted">
          <UserPlus className="size-4" aria-hidden />
          {t("home.withoutAccount", { count: withoutAccount })}
          <Link to="/employees?status=active&account=none" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("home.inviteThem")}
          </Link>
        </p>
      )}
    </Panel>
  );
}

interface Upcoming {
  key: string;
  date: string;
  daysLeft: number;
  employee: { id: string; fullNameAr: string; fullNameEn: string };
  label: string;
  tone: Tone;
  to: string;
}

/** Days from `today` to the next yearly occurrence of a date (birthday, hire anniversary). */
function nextYearly(date: string, today: string): { date: string; daysLeft: number } {
  const year = Number(today.slice(0, 4));
  const md = date.slice(5, 10);
  // 29 Feb falls on 28 Feb in a non-leap year.
  const on = (y: number): string => {
    const iso = `${y}-${md}`;
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) || new Date(`${iso}T00:00:00Z`).toISOString().slice(5, 10) !== md ? `${y}-02-28` : iso;
  };
  let next = on(year);
  if (next < today) next = on(year + 1);
  return { date: next, daysLeft: Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) };
}

/** 4. The next 30 days: contract and probation ends, documents expiring, work anniversaries, birthdays. */
function UpcomingCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const today = todayInRiyadh();
  const canEmployees = can(PERMISSIONS.EMPLOYEES_READ);
  const contracts = useQuery({
    queryKey: ["contracts", "ending", UPCOMING_DAYS],
    queryFn: () => apiJson<ContractEndingView[]>(`/api/v1/contracts/ending?days=${UPCOMING_DAYS}`),
    enabled: can(PERMISSIONS.CONTRACTS_READ),
  });
  const documents = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: () => apiJson<ExpiringDocument[]>("/api/v1/documents/expiring?days=60"),
    enabled: canEmployees,
  });
  const employees = useEmployees(canEmployees);

  const items: Upcoming[] = [];
  for (const c of contracts.data ?? []) {
    items.push({
      key: `${c.kind}-${c.contractId}`,
      date: c.date,
      daysLeft: c.daysLeft,
      employee: c.employee,
      label: t(`home.upcoming.${c.kind}`),
      tone: "warning",
      to: `/employees/${c.employee.id}?tab=job`,
    });
  }
  for (const d of documents.data ?? []) {
    if (d.daysLeft > UPCOMING_DAYS) continue;
    items.push({
      key: `doc-${d.id}`,
      date: d.expiryDate,
      daysLeft: d.daysLeft,
      employee: d.employee,
      label: t("home.upcoming.document", { type: t(`documents.types.${d.type}`) }),
      tone: d.daysLeft < 0 ? "danger" : "warning",
      to: `/employees/${d.employee.id}?tab=documents`,
    });
  }
  for (const e of employees.data ?? []) {
    if (e.status !== "active") continue;
    const anniversary = nextYearly(e.hireDate.slice(0, 10), today);
    const years = Number(anniversary.date.slice(0, 4)) - Number(e.hireDate.slice(0, 4));
    if (years >= 1 && anniversary.daysLeft <= UPCOMING_DAYS) {
      items.push({ key: `work-${e.id}`, ...anniversary, employee: e, label: t("home.upcoming.anniversary", { count: years }), tone: "info", to: `/employees/${e.id}` });
    }
    // Birth dates are personal data: the API only returns them to employees:read-sensitive holders.
    if (e.birthDate) {
      const birthday = nextYearly(e.birthDate.slice(0, 10), today);
      if (birthday.daysLeft <= UPCOMING_DAYS) items.push({ key: `birthday-${e.id}`, ...birthday, employee: e, label: t("home.upcoming.birthday"), tone: "neutral", to: `/employees/${e.id}` });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  const loading = contracts.isLoading || documents.isLoading || employees.isLoading;

  return (
    <Panel id="upcoming" className="scroll-mt-24">
      <PanelHeader title={t("home.upcoming.title")} />
      {loading && items.length === 0 ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <p className="text-body text-ink-muted">{t("home.upcoming.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 8).map((u) => (
            <PersonRow
              key={u.key}
              employee={u.employee}
              to={u.to}
              meta={`${u.label} · ${u.date}`}
              badge={
                <Badge tone={u.tone}>
                  {u.daysLeft < 0 ? t("home.expired") : u.daysLeft === 0 ? t("shortleave.day.today") : t("home.daysLeft", { count: u.daysLeft })}
                </Badge>
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 3. Who is out today and this week: approved / pending leave and short permissions. */
function OutCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const typeName = useTypeName();
  const today = todayInRiyadh();
  const weekEnd = shiftDate(today, 6);
  const leave = useLeaveRequests({ from: today, to: weekEnd }, can(PERMISSIONS.LEAVE_READ));
  const short = useQuery({
    queryKey: ["shortleave", "list", "all", ""],
    queryFn: () => apiJson<ShortLeaveView[]>("/api/v1/shortleave/requests"),
    enabled: can(PERMISSIONS.SHORTLEAVE_READ),
  });
  type Row = { key: string; employee: { id: string; fullNameAr: string; fullNameEn: string }; meta: string; pending: boolean; start: string; today: boolean };
  const rows: Row[] = [];
  for (const r of leave.data ?? []) {
    if (!r.employee || (r.status !== "approved" && r.status !== "pending")) continue;
    rows.push({
      key: `l-${r.id}`,
      employee: r.employee,
      meta: `${typeName(r.leaveType)} · ${ltr(formatDateRange(r.startDate, r.endDate))}`,
      pending: r.status === "pending",
      start: r.startDate,
      today: r.startDate <= today && r.endDate >= today,
    });
  }
  for (const r of short.data ?? []) {
    if (!r.employee || r.date < today || r.date > weekEnd || (r.status !== "approved" && r.status !== "pending")) continue;
    rows.push({
      key: `s-${r.id}`,
      employee: r.employee,
      meta: `${t(`shortleave.kinds.${r.kind}`)} · ${ltr(`${r.date} ${r.fromTime}–${r.toTime}`)}`,
      pending: r.status === "pending",
      start: r.date,
      today: r.date === today,
    });
  }
  rows.sort((a, b) => Number(b.today) - Number(a.today) || a.start.localeCompare(b.start));
  const todayRows = rows.filter((r) => r.today);
  const laterRows = rows.filter((r) => !r.today);
  const list = (items: Row[]): React.JSX.Element => (
    <ul className="divide-y divide-line">
      {items.slice(0, 6).map((r) => (
        <PersonRow key={r.key} employee={r.employee} meta={r.meta} badge={r.pending ? <Badge tone="warning">{t("leave.status.pending")}</Badge> : undefined} />
      ))}
    </ul>
  );
  return (
    <Panel>
      <PanelHeader
        title={t("home.out.title")}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/leave?tab=calendar">{t("home.viewAll")}</Link>
          </Button>
        }
      />
      {(leave.isLoading || short.isLoading) && rows.length === 0 ? (
        <Skeleton className="h-32" />
      ) : rows.length === 0 ? (
        <p className="text-body text-ink-muted">{t("home.out.none")}</p>
      ) : (
        <div className="space-y-4">
          {todayRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-meta font-medium text-ink-muted">{t("home.out.today", { count: todayRows.length })}</h3>
              {list(todayRows)}
            </div>
          )}
          {laterRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-meta font-medium text-ink-muted">{t("home.out.week")}</h3>
              {list(laterRows)}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** 5. This month's payroll: the stage it is at and what to do next (last month first while it isn't exported). */
function PayrollCard(): React.JSX.Element {
  const { t } = useTranslation();
  const today = todayInRiyadh();
  const current = today.slice(0, 7);
  const previous = shiftDate(`${current}-01`, -1).slice(0, 7);
  const runs = useQuery({ queryKey: ["payroll", "runs"], queryFn: () => apiJson<PayrollRunView[]>("/api/v1/payroll-runs") });
  const prevRun = runs.data?.find((r) => r.period === previous);
  const run = prevRun && prevRun.status !== "exported" ? prevRun : runs.data?.find((r) => r.period === current);
  const period = run?.period ?? (prevRun ? current : previous);
  const stage = !run ? "none" : run.status === "calculated" ? (run.approvableFrom > today ? "early" : "approve") : run.status;
  const tone: Tone = stage === "exported" ? "success" : stage === "none" ? "neutral" : "warning";
  return (
    <Panel>
      <PanelHeader
        title={t("home.payroll.title", { period })}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to={run ? `/payroll/${run.id}` : "/payroll"}>{t("home.payroll.open")}</Link>
          </Button>
        }
      />
      {runs.isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="space-y-3">
          <Badge tone={tone} dot>
            {t(`home.payroll.stage.${stage}`, { date: run?.approvableFrom ?? "" })}
          </Badge>
          {run && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-meta text-ink-muted">{t("home.payroll.employees")}</dt>
                <dd className="mt-1 text-section tabular-nums">{run.totals.employees}</dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{t("home.payroll.net")}</dt>
                <dd className="mt-1 text-section tabular-nums">
                  <bdi dir="ltr">{formatHalalas(run.totals.netHalalas)}</bdi> <span className="text-meta font-normal text-ink-muted">{t("employees.salary.sar")}</span>
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}

/** HR / manager dashboard (ux-redesign-v2 §7, ui-spec §7.6). */
export function HrDashboard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const today = todayInRiyadh();
  const canEmployees = can(PERMISSIONS.EMPLOYEES_READ);
  const canAttendance = can(PERMISSIONS.ATTENDANCE_READ);
  const canLeave = can(PERMISSIONS.LEAVE_READ);

  const employees = useEmployees(canEmployees);
  const board = useBoard(today, "", canAttendance);
  const trendDays = useQuery({
    queryKey: ["attendance", "trend", today],
    queryFn: () => apiJson<Array<{ employee: EmployeeRef; day: AttendanceDay }>>(`/api/v1/attendance/days?from=${shiftDate(today, -21)}&to=${shiftDate(today, -1)}`),
    enabled: canAttendance,
  });
  const leaveToday = useLeaveRequests({ from: today, to: today, status: "approved" }, canLeave);

  const list = employees.data ?? [];
  const active = list.filter((e) => e.status === "active");
  const withoutAccount = can(PERMISSIONS.EMPLOYEES_INVITE) ? active.filter((e) => !e.userId).length : 0;

  const rows = board.data?.rows ?? [];
  const count = (s: string): number => rows.filter((r) => r.state === s).length;
  const working = rows.filter((r) => r.state !== "weekend" && r.state !== "holiday");
  const inToday = count("present") + count("late");
  const attendanceRate = working.length ? Math.round((inToday / working.length) * 100) : 0;
  const lateRows = rows.filter((r) => r.state === "late").slice(0, 5);
  const notYet = rows.filter((r) => r.state === "not_yet");
  const onLeaveToday = (leaveToday.data ?? []).filter((r) => r.startDate <= today && r.endDate >= today);

  const trend: TrendPoint[] = useMemo(() => {
    const byDate = new Map<string, { in: number; judged: number }>();
    for (const { day } of trendDays.data ?? []) {
      if (!day.status || day.status === "weekend" || day.status === "holiday") continue;
      const cur = byDate.get(day.workDate) ?? { in: 0, judged: 0 };
      cur.judged += day.status === "leave" ? 0 : 1;
      cur.in += day.status === "present" || day.status === "late" ? 1 : 0;
      byDate.set(day.workDate, cur);
    }
    const weekday = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { weekday: "short", timeZone: "UTC" });
    return [...byDate.entries()]
      .filter(([, v]) => v.judged > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, v]) => {
        const value = (v.in / v.judged) * 100;
        return {
          key: date,
          label: weekday.format(new Date(`${date}T00:00:00Z`)),
          value,
          detail: t("home.trendDetail", { date, rate: Math.round(value), present: v.in, total: v.judged }),
        };
      });
  }, [trendDays.data, i18n.language, t]);

  const showUpcoming = canEmployees || can(PERMISSIONS.CONTRACTS_READ);
  const showOut = canLeave || can(PERMISSIONS.SHORTLEAVE_READ);

  return (
    <div className="space-y-6">
      {/* 1. What waits on me — the reason to open the app. */}
      <InboxCard withoutAccount={withoutAccount} />

      {/* 2. Today in four numbers. */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {canEmployees && (
          <StatTile
            icon={Users}
            label={t("home.kpi.employees")}
            value={active.length}
            sub={t("home.kpi.employeesSub", { total: list.length, noAccount: active.filter((e) => !e.userId).length })}
            to="/employees?status=active"
            loading={employees.isLoading}
          />
        )}
        {canAttendance && (
          <StatTile
            icon={UserCheck}
            tone="success"
            label={t("home.kpi.present")}
            value={
              <>
                {inToday}
                <span className="text-body font-normal text-ink-muted"> / {working.length}</span>
              </>
            }
            sub={t("home.kpi.attendanceSub", { rate: attendanceRate, late: count("late") })}
            to="/attendance"
            loading={board.isLoading}
          />
        )}
        {canAttendance && (
          <StatTile
            icon={UserX}
            tone="danger"
            label={t("home.kpi.absent")}
            value={count("absent")}
            sub={t("home.kpi.notYetSub", { count: count("not_yet") })}
            to="/attendance"
            loading={board.isLoading}
          />
        )}
        {canLeave && (
          <StatTile
            icon={CalendarDays}
            tone="info"
            label={t("home.kpi.onLeave")}
            value={onLeaveToday.length}
            sub={t("home.out.title")}
            to="/leave?tab=calendar"
            loading={leaveToday.isLoading}
          />
        )}
      </div>

      {/* Today's attendance in detail: late arrivals and who hasn't come in yet. */}
      {canAttendance && (
        <Panel>
          <PanelHeader
            title={t("home.attendanceToday")}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/attendance">{t("home.viewAll")}</Link>
              </Button>
            }
          />
          {board.isLoading ? (
            <Skeleton className="h-24" />
          ) : working.length === 0 ? (
            <p className="text-body text-ink-muted">{t("home.dayOff")}</p>
          ) : (
            <div className="space-y-6">
              <StatusBar
                label={t("home.attendanceToday")}
                segments={[
                  { key: "present", label: t("attendance.status.present"), count: count("present"), colorClass: "bg-success" },
                  { key: "late", label: t("attendance.status.late"), count: count("late"), colorClass: "bg-warning" },
                  { key: "absent", label: t("attendance.status.absent"), count: count("absent"), colorClass: "bg-danger" },
                  { key: "leave", label: t("attendance.status.leave"), count: count("leave"), colorClass: "bg-info" },
                  { key: "not_yet", label: t("attendance.status.not_yet"), count: count("not_yet"), colorClass: "bg-line-strong" },
                ]}
              />
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-meta font-medium text-ink-muted">{t("home.lateToday")}</h3>
                  {lateRows.length === 0 ? (
                    <p className="text-dense text-ink-muted">{t("home.noneLate")}</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {lateRows.map((r) => (
                        <PersonRow
                          key={r.employee.id}
                          employee={r.employee}
                          to={`/attendance/people/${r.employee.id}?month=${today.slice(0, 7)}`}
                          meta={t("home.lateBy", { time: formatTime(r.day?.firstInAt ?? null), minutes: r.day?.lateMin ?? 0 })}
                        />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 text-meta font-medium text-ink-muted">{t("home.notInYet", { count: notYet.length })}</h3>
                  {notYet.length === 0 ? (
                    <p className="text-dense text-ink-muted">{t("home.everyoneIn")}</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {notYet.slice(0, 5).map((r) => (
                        <PersonRow key={r.employee.id} employee={r.employee} meta={r.employee.employeeNo} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* 3–4. Who is out, and what's coming up. */}
      {(showOut || showUpcoming) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {showOut && <OutCard />}
          {showUpcoming && <UpcomingCard />}
        </div>
      )}

      {/* 5–6. Payroll this month, and the last working days. */}
      {(can(PERMISSIONS.PAYROLL_READ) || canAttendance) && (
        <div className="grid gap-6 lg:grid-cols-3">
          {can(PERMISSIONS.PAYROLL_READ) && <PayrollCard />}
          {canAttendance && (
            <Panel className={can(PERMISSIONS.PAYROLL_READ) ? "lg:col-span-2" : "lg:col-span-3"}>
              <PanelHeader title={t("home.trendTitle")} />
              {trendDays.isLoading ? (
                <Skeleton className="h-48" />
              ) : trend.length === 0 ? (
                <p className="text-body text-ink-muted">{t("home.trendEmpty")}</p>
              ) : (
                <>
                  <p className="-mt-2 mb-4 text-meta text-ink-muted">{t("home.trendSub")}</p>
                  <ColumnTrend points={trend} caption={t("home.trendTitle")} />
                </>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
