import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarCheck, ClipboardList, Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { useMyDays, useToday } from "@/features/attendance/api";
import { AttendanceBadge } from "@/features/attendance/status-badge";
import { useAuth } from "@/features/auth";
import { useMyBalances, useMyLeaveRequests } from "@/features/leave/api";
import { LeaveBadge, useTypeName } from "@/features/leave/leave-badge";
import { notificationText } from "@/features/notifications/notification-text";
import { apiJson } from "@/lib/api";
import { formatDateTime, formatTime, todayInRiyadh } from "@/lib/dates";
import type { AppNotification, Employee, EmployeeDocument } from "@/lib/types";
import { StatTile } from "./stat-tile";

function CheckItem({ label, done, tone, status }: { label: string; done: boolean; tone: Tone; status: string }): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <Link to="/profile" className="flex min-h-11 flex-1 items-center text-body text-ink hover:text-primary">
        {label}
      </Link>
      <Badge tone={done ? "success" : tone} dot>
        {status}
      </Badge>
    </li>
  );
}

/** Employee dashboard (ui-spec §7.6), mobile-first: my day, my balances, what's open, what to finish. */
export function EmployeeDashboard({ me }: { me: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const { can } = useAuth();
  const canPunch = can(PERMISSIONS.ATTENDANCE_PUNCH);
  const canLeave = can(PERMISSIONS.LEAVE_REQUEST);
  const month = todayInRiyadh().slice(0, 7);

  const today = useToday(canPunch);
  const monthDays = useMyDays(`${month}-01`, todayInRiyadh());
  const balances = useMyBalances(canLeave);
  const myLeave = useMyLeaveRequests();
  const custody = useQuery({
    queryKey: ["custody", "mine"],
    queryFn: () => apiJson<Array<{ status: string }>>("/api/v1/custody/me/requests"),
    enabled: can(PERMISSIONS.CUSTODY_REQUEST),
  });
  const docs = useQuery({
    queryKey: ["me", "documents"],
    queryFn: () => apiJson<EmployeeDocument[]>("/api/v1/me/documents"),
    enabled: can(PERMISSIONS.EMPLOYEES_SELF_SERVICE),
  });
  const canNotifications = can(PERMISSIONS.NOTIFICATIONS_READ);
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiJson<{ items: AppNotification[] }>("/api/v1/notifications?limit=20"),
    enabled: canNotifications,
  });

  const day = today.data?.day ?? null;
  const checkedIn = today.data?.punches.at(-1)?.kind === "in";
  const judged = (monthDays.data ?? []).filter((d) => d.status === "present" || d.status === "late" || d.status === "absent");
  const attended = judged.filter((d) => d.status !== "absent").length;
  const lateDays = judged.filter((d) => d.status === "late").length;
  const annual = balances.data?.find((b) => b.leaveType.code === "annual");
  const openLeave = (myLeave.data ?? []).filter((r) => r.status === "pending").length;
  const openCustody = (custody.data ?? []).filter((c) => c.status === "requested" || c.status === "approved" || c.status === "paid").length;
  const upcoming = (myLeave.data ?? [])
    .filter((r) => (r.status === "approved" || r.status === "pending") && r.endDate >= todayInRiyadh())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);

  // Complete-your-profile checklist.
  const docList = docs.data ?? [];
  const hasPhone = Boolean(me.phone);
  const ibanState = me.iban ? "approved" : me.ibanReviewStatus;
  const hasApprovedDoc = docList.some((d) => d.reviewStatus === "approved");
  const complete = hasPhone && ibanState === "approved" && hasApprovedDoc;
  const pendingOr = (state: string | null | undefined): { tone: Tone; text: string } =>
    state === "pending_review"
      ? { tone: "warning", text: t("review.status.pending_review") }
      : state === "rejected"
        ? { tone: "danger", text: t("review.status.rejected") }
        : { tone: "neutral", text: t("home.missing") };
  const docState = pendingOr(docList.some((d) => d.reviewStatus === "pending_review") ? "pending_review" : docList.some((d) => d.reviewStatus === "rejected") ? "rejected" : null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {canPunch && (
          <StatTile
            icon={Fingerprint}
            label={t("home.myAttendance")}
            value={formatTime(day?.firstInAt ?? null)}
            sub={day?.status ? t(`attendance.status.${day.status}`) : t("attendance.status.not_yet")}
            to="/my-attendance"
            loading={today.isLoading}
          />
        )}
        {canPunch && (
          <StatTile
            icon={CalendarCheck}
            label={t("home.kpi.monthAttendance")}
            value={
              <>
                {attended}
                <span className="text-body font-normal text-ink-muted"> / {judged.length}</span>
              </>
            }
            sub={t("home.kpi.lateDays", { count: lateDays })}
            to="/my-attendance"
            loading={monthDays.isLoading}
          />
        )}
        {canLeave && (
          <StatTile
            icon={CalendarDays}
            label={t("home.kpi.annualLeave")}
            value={annual?.availableDays ?? "—"}
            sub={annual ? t("home.kpi.annualLeaveSub", { entitled: annual.entitledDays ?? 0, used: annual.usedDays }) : undefined}
            to="/leave"
            loading={balances.isLoading}
          />
        )}
        <StatTile
          icon={ClipboardList}
          label={t("home.kpi.myOpen")}
          value={openLeave + openCustody}
          sub={t("home.kpi.myOpenSub", { leave: openLeave, custody: openCustody })}
          to="/leave"
          loading={myLeave.isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canPunch && (
          <Panel className="lg:col-span-2">
            <PanelHeader
              title={t("home.myAttendance")}
              actions={today.data && <AttendanceBadge state={day?.status ?? (today.data.kind === "working" ? "not_yet" : today.data.kind)} />}
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <dl className="flex gap-8">
                <div>
                  <dt className="text-meta text-ink-muted">{t("attendance.in")}</dt>
                  <dd className="text-page-title tabular-nums">{formatTime(day?.firstInAt ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-meta text-ink-muted">{t("attendance.out")}</dt>
                  <dd className="text-page-title tabular-nums">{formatTime(day?.lastOutAt ?? null)}</dd>
                </div>
              </dl>
              <Button asChild size="lg" className="w-full sm:w-auto" variant={checkedIn ? "secondary" : "primary"}>
                <Link to="/my-attendance">{checkedIn ? t("attendance.checkOut") : t("attendance.checkIn")}</Link>
              </Button>
            </div>
          </Panel>
        )}
        <Panel className={canPunch ? "" : "lg:col-span-3"}>
          <PanelHeader
            title={t("home.upcomingLeave")}
            actions={
              canLeave && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/leave">{t("leave.request.title")}</Link>
                </Button>
              )
            }
          />
          {upcoming.length === 0 ? (
            <p className="text-body text-ink-muted">{t("home.noUpcomingLeave")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block text-dense font-medium">{typeName(r.leaveType)}</span>
                    <span className="block text-meta tabular-nums text-ink-muted">
                      <bdi>{r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}</bdi>
                    </span>
                  </span>
                  <LeaveBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {!complete && docs.data && (
          <Panel>
            <PanelHeader title={t("home.completeProfile")} />
            <ul className="divide-y divide-line">
              <CheckItem label={t("employees.fields.phone")} done={hasPhone} tone="neutral" status={hasPhone ? t("home.done") : t("home.missing")} />
              <CheckItem
                label={t("employees.fields.iban")}
                done={ibanState === "approved"}
                tone={pendingOr(ibanState).tone}
                status={ibanState === "approved" ? t("review.status.approved") : pendingOr(ibanState).text}
              />
              <CheckItem label={t("documents.title")} done={hasApprovedDoc} tone={docState.tone} status={hasApprovedDoc ? t("review.status.approved") : docState.text} />
            </ul>
          </Panel>
        )}
        {canNotifications && (
        <Panel className={!complete && docs.data ? "" : "lg:col-span-2"}>
          <PanelHeader title={t("home.latestNotifications")} />
          {notifications.data && notifications.data.items.length > 0 ? (
            <ul className="divide-y divide-line">
              {notifications.data.items.slice(0, 5).map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-body text-ink">{notificationText(t, n).title}</p>
                  <p className="text-meta tabular-nums text-ink-muted">
                    <bdi>{formatDateTime(n.createdAt)}</bdi>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-muted">{t("notifications.empty")}</p>
          )}
        </Panel>
        )}
      </div>
    </div>
  );
}
