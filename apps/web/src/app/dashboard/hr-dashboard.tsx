import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, FileWarning, HandCoins, UserCheck, UserX, Users, Wallet } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard, type AttendanceDay, type EmployeeRef } from "@/features/attendance/api";
import { useAuth } from "@/features/auth";
import { useEmployees, useRefs } from "@/features/employees/api";
import { nameIn } from "@/features/employees/employee-name";
import { useLeaveRequests } from "@/features/leave/api";
import { useTypeName } from "@/features/leave/leave-badge";
import { apiJson } from "@/lib/api";
import { formatTime, todayInRiyadh } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import type { ReviewQueue } from "@/lib/types";
import { BarList } from "./bar-list";
import { ColumnTrend, type TrendPoint } from "./column-trend";
import { StatTile } from "./stat-tile";
import { StatusBar } from "./status-bar";

interface ExpiringDocument {
  id: string;
  type: string;
  expiryDate: string;
  daysLeft: number;
  employee: { id: string; fullNameAr: string; fullNameEn: string };
}

interface CustodyRow {
  status: string;
  amountHalalas: string;
  settledAmountHalalas: string | null;
  actions?: string[];
}

const shiftDate = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function ActionRow({ text, to, label }: { text: string; to: string; label: string }): React.JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <p className="text-body text-ink">{text}</p>
      <Button variant="secondary" size="sm" asChild>
        <Link to={to}>{label}</Link>
      </Button>
    </li>
  );
}

function PersonRow({ employee, meta, badge }: { employee: { id: string; fullNameAr: string; fullNameEn: string }; meta?: string; badge?: React.ReactNode }): React.JSX.Element {
  const { i18n } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Avatar name={employee.fullNameAr} size="sm" />
      <Link to={`/employees/${employee.id}`} className="min-w-0 flex-1 hover:text-primary">
        <span className="block truncate text-dense font-medium">{nameIn(i18n, employee)}</span>
        {meta && <span className="block text-meta tabular-nums text-ink-muted">{meta}</span>}
      </Link>
      {badge}
    </li>
  );
}

/** HR / manager dashboard (ui-spec §7.6): action first, then today's picture, then trends and lists. */
export function HrDashboard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const typeName = useTypeName();
  const { can } = useAuth();
  const today = todayInRiyadh();
  const canEmployees = can(PERMISSIONS.EMPLOYEES_READ);
  const canAttendance = can(PERMISSIONS.ATTENDANCE_READ);
  const canLeave = can(PERMISSIONS.LEAVE_READ);
  const canCustody = can(PERMISSIONS.CUSTODY_READ);
  const canReview = can(PERMISSIONS.EMPLOYEES_REVIEW);

  const employees = useEmployees(canEmployees);
  const departments = useRefs("departments", canEmployees);
  const board = useBoard(today, "", canAttendance);
  const trendDays = useQuery({
    queryKey: ["attendance", "trend", today],
    queryFn: () => apiJson<Array<{ employee: EmployeeRef; day: AttendanceDay }>>(`/api/v1/attendance/days?from=${shiftDate(today, -21)}&to=${shiftDate(today, -1)}`),
    enabled: canAttendance,
  });
  const leaveWeek = useLeaveRequests({ from: today, to: shiftDate(today, 6) }, canLeave);
  const pendingLeave = useLeaveRequests({ status: "pending" }, canLeave && can(PERMISSIONS.LEAVE_APPROVE));
  const custody = useQuery({ queryKey: ["custody", "list", ""], queryFn: () => apiJson<CustodyRow[]>("/api/v1/custody/requests"), enabled: canCustody });
  const reviews = useQuery({ queryKey: ["review-queue"], queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"), enabled: canReview });
  const expiring = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: () => apiJson<ExpiringDocument[]>("/api/v1/documents/expiring?days=60"),
    enabled: canEmployees,
  });

  // ---- derived figures ----
  const list = employees.data ?? [];
  const active = list.filter((e) => e.status === "active");
  const withoutAccount = active.filter((e) => !e.userId).length;

  const rows = board.data?.rows ?? [];
  const count = (s: string): number => rows.filter((r) => r.state === s).length;
  const working = rows.filter((r) => r.state !== "weekend" && r.state !== "holiday");
  const inToday = count("present") + count("late");
  const attendanceRate = working.length ? Math.round((inToday / working.length) * 100) : 0;
  const lateRows = rows.filter((r) => r.state === "late").slice(0, 5);
  const notYet = rows.filter((r) => r.state === "not_yet");

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

  const onLeaveToday = (leaveWeek.data ?? []).filter((r) => r.status === "approved" && r.startDate <= today && r.endDate >= today);
  const upcomingLeave = (leaveWeek.data ?? [])
    .filter((r) => r.status === "approved" || r.status === "pending")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const custodyRows = custody.data ?? [];
  const outstanding = custodyRows
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + BigInt(c.amountHalalas), 0n);
  const custodyActions = custodyRows.filter((c) => (c.actions ?? []).length > 0).length;
  const leaveActions = (pendingLeave.data ?? []).filter((r) => r.canDecide).length;
  const reviewActions = reviews.data ? reviews.data.ibans.length + reviews.data.documents.length : 0;

  const deptName = new Map((departments.data ?? []).map((d) => [d.id, d.name]));
  const byDept = [...active.reduce((m, e) => m.set(e.departmentId ?? "", (m.get(e.departmentId ?? "") ?? 0) + 1), new Map<string, number>())]
    .map(([id, value]) => ({ key: id || "none", label: id ? (deptName.get(id) ?? "—") : t("home.noDepartment"), value }))
    .sort((a, b) => b.value - a.value);
  const deptRows = byDept.length > 6 ? [...byDept.slice(0, 5), { key: "other", label: t("home.otherDepartments"), value: byDept.slice(5).reduce((s, r) => s + r.value, 0) }] : byDept;

  const actionRows = [
    { key: "reviews", n: reviewActions, text: t("home.pendingReviews", { count: reviewActions }), to: "/review-queue", label: t("home.openReviewQueue") },
    { key: "leave", n: leaveActions, text: t("home.pendingLeave", { count: leaveActions }), to: "/leave?tab=approvals", label: t("home.openLeave") },
    { key: "custody", n: custodyActions, text: t("home.pendingCustody", { count: custodyActions }), to: "/custody?tab=manage", label: t("home.openCustody") },
    {
      key: "docs",
      n: (expiring.data ?? []).filter((d) => d.daysLeft <= 30).length,
      text: t("home.expiringSoon", { count: (expiring.data ?? []).filter((d) => d.daysLeft <= 30).length }),
      to: "/employees",
      label: t("home.view"),
    },
  ].filter((r) => r.n > 0);

  return (
    <div className="space-y-6">
      {/* KPI tiles: today's people first, then what is waiting */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {canEmployees && (
          <StatTile
            icon={Users}
            label={t("home.kpi.employees")}
            value={active.length}
            sub={t("home.kpi.employeesSub", { total: list.length, noAccount: withoutAccount })}
            to="/employees"
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
            sub={t("home.kpi.onLeaveSub", { count: upcomingLeave.length })}
            to="/leave?tab=calendar"
            loading={leaveWeek.isLoading}
          />
        )}
        {canLeave && can(PERMISSIONS.LEAVE_APPROVE) && (
          <StatTile
            icon={Clock}
            tone="warning"
            label={t("home.kpi.pendingLeave")}
            value={leaveActions}
            sub={t("home.kpi.pendingLeaveSub")}
            to="/leave?tab=approvals"
            loading={pendingLeave.isLoading}
          />
        )}
        {canCustody && (
          <StatTile
            icon={HandCoins}
            tone="warning"
            label={t("home.kpi.pendingCustody")}
            value={custodyActions}
            sub={t("home.kpi.pendingCustodySub")}
            to="/custody?tab=manage"
            loading={custody.isLoading}
          />
        )}
        {canCustody && (
          <StatTile
            icon={Wallet}
            label={t("home.kpi.custody")}
            value={
              <>
                <bdi>{formatHalalas(outstanding.toString())}</bdi>
                <span className="text-body font-normal text-ink-muted"> {t("employees.salary.sar")}</span>
              </>
            }
            sub={t("home.kpi.custodySub")}
            to="/custody?tab=manage"
            loading={custody.isLoading}
          />
        )}
        {canEmployees && (
          <StatTile
            icon={FileWarning}
            tone="danger"
            label={t("home.kpi.expiring")}
            value={(expiring.data ?? []).filter((d) => d.daysLeft <= 30).length}
            sub={t("home.kpi.expiringSub")}
            loading={expiring.isLoading}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today */}
        {canAttendance && (
          <Panel className="lg:col-span-2">
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

        {/* Needs action */}
        {(canLeave || canCustody || canReview || canEmployees) && (
          <Panel className={canAttendance ? "" : "lg:col-span-3"}>
            <PanelHeader title={t("home.needsAction")} />
            {actionRows.length === 0 ? (
              <p className="text-body text-ink-muted">{t("home.nothingToDo")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {actionRows.map((r) => (
                  <ActionRow key={r.key} text={r.text} to={r.to} label={r.label} />
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canAttendance && (
          <Panel className="lg:col-span-2">
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
        {canEmployees && (
          <Panel>
            <PanelHeader title={t("home.expiringTitle")} />
            {expiring.isLoading ? (
              <Skeleton className="h-32" />
            ) : (expiring.data ?? []).length === 0 ? (
              <p className="text-body text-ink-muted">{t("home.noExpiring")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {(expiring.data ?? []).slice(0, 6).map((d) => (
                  <PersonRow
                    key={d.id}
                    employee={d.employee}
                    meta={`${t(`documents.types.${d.type}`)} · ${d.expiryDate}`}
                    badge={
                      <Badge tone={d.daysLeft < 0 ? "danger" : d.daysLeft <= 30 ? "warning" : "neutral"}>
                        {d.daysLeft < 0 ? t("home.expired") : t("home.daysLeft", { count: d.daysLeft })}
                      </Badge>
                    }
                  />
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canLeave && (
          <Panel>
            <PanelHeader
              title={t("home.leaveThisWeek")}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/leave?tab=calendar">{t("home.viewAll")}</Link>
                </Button>
              }
            />
            {upcomingLeave.length === 0 ? (
              <p className="text-body text-ink-muted">{t("home.noLeaveWeek")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcomingLeave.map((r) =>
                  r.employee ? (
                    <PersonRow
                      key={r.id}
                      employee={r.employee}
                      meta={`${typeName(r.leaveType)} · ${r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}`}
                      badge={r.status === "pending" ? <Badge tone="warning">{t("leave.status.pending")}</Badge> : undefined}
                    />
                  ) : null,
                )}
              </ul>
            )}
          </Panel>
        )}
        {canEmployees && (
          <Panel>
            <PanelHeader title={t("home.byDepartment")} />
            {employees.isLoading ? <Skeleton className="h-32" /> : <BarList rows={deptRows} emptyText={t("employees.empty")} />}
          </Panel>
        )}
        {canCustody && (
          <Panel>
            <PanelHeader
              title={t("home.custodyTitle")}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/custody?tab=manage">{t("home.viewAll")}</Link>
                </Button>
              }
            />
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-meta text-ink-muted">{t("home.custodyOutstanding")}</dt>
                <dd className="mt-1 text-section tabular-nums">
                  <bdi>{formatHalalas(outstanding.toString())}</bdi> <span className="text-meta font-normal text-ink-muted">{t("employees.salary.sar")}</span>
                </dd>
              </div>
              <div>
                <dt className="text-meta text-ink-muted">{t("home.custodyOpen")}</dt>
                <dd className="mt-1 text-section tabular-nums">{custodyRows.filter((c) => c.status === "requested" || c.status === "approved").length}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-center gap-2 text-meta text-ink-muted">
              <FileWarning className="size-4" aria-hidden="true" />
              {t("home.custodyNote")}
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
