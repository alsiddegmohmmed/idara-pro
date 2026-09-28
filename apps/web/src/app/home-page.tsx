import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth";
import { useBoard, useToday } from "@/features/attendance/api";
import { AttendanceBadge } from "@/features/attendance/status-badge";
import { useEmployees } from "@/features/employees/api";
import { useLeaveRequests } from "@/features/leave/api";
import { nameIn } from "@/features/employees/employee-name";
import { notificationText } from "@/features/notifications/notification-text";
import { apiJson } from "@/lib/api";
import { formatDateTime, formatLongDate, formatTime, riyadhHour, todayInRiyadh } from "@/lib/dates";
import type { AppNotification, Employee, EmployeeDocument, ReviewQueue } from "@/lib/types";

/** ui-spec §7.6: action first, statistics second. HR and employees get different dashboards. */
export function HomePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const selfService = can(PERMISSIONS.EMPLOYEES_SELF_SERVICE);
  const isHr = can(PERMISSIONS.EMPLOYEES_READ) || can(PERMISSIONS.EMPLOYEES_REVIEW);
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiJson<Employee>("/api/v1/me/profile"), enabled: selfService });

  const now = new Date();
  const hour = riyadhHour(now);
  const greeting = hour < 12 ? t("home.morning") : t("home.evening");
  const firstName = me.data ? nameIn(i18n, me.data).split(/\s+/)[0] : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? t("home.greeting", { greeting, name: firstName }) : greeting}
        description={formatLongDate(now, i18n.language)}
      />
      {(can(PERMISSIONS.EMPLOYEES_REVIEW) || can(PERMISSIONS.LEAVE_APPROVE) || can(PERMISSIONS.CUSTODY_READ)) && <NeedsActionPanel />}
      {isHr && <HrDashboard />}
      {selfService && me.data && <EmployeeDashboard me={me.data} />}
      {!isHr && !selfService && <p className="text-body text-ink-muted">{t("home.nothingYet")}</p>}
    </div>
  );
}

function ActionRow({ text, action }: { text: string; action: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <p className="text-body text-ink">{text}</p>
      {action}
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-page-title tabular-nums text-ink">{value}</p>
      <p className="text-meta text-ink-muted">{label}</p>
    </div>
  );
}

function HrDashboard(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canRead = can(PERMISSIONS.EMPLOYEES_READ);
  const employees = useEmployees();
  const list = canRead ? employees.data : undefined;

  const active = list?.filter((e) => e.status === "active").length ?? 0;
  const linked = list?.filter((e) => e.userId).length ?? 0;

  // TODO(ui-spec §7.6): "documents expiring in 30 days" and "invitations not accepted after 3 days"
  // need company-wide read endpoints that don't exist yet; add rows here when they do.
  return (
    <>
      {can(PERMISSIONS.ATTENDANCE_READ) && <AttendanceTodayPanel />}

      {canRead && (
        <div className="grid gap-6 md:grid-cols-2">
          <Panel>
            <PanelHeader
              title={t("nav.employees")}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/employees">{t("home.viewAll")}</Link>
                </Button>
              }
            />
            {list ? (
              <div className="grid grid-cols-3 gap-4">
                <Stat value={list.length} label={t("home.total")} />
                <Stat value={active} label={t("employees.status.active")} />
                <Stat value={list.length - active} label={t("employees.status.inactive")} />
              </div>
            ) : (
              <Skeleton className="h-16" />
            )}
          </Panel>
          <Panel>
            <PanelHeader title={t("home.accounts")} />
            {list ? (
              <div className="grid grid-cols-2 gap-4">
                <Stat value={linked} label={t("employees.account.linked")} />
                <Stat value={list.length - linked} label={t("employees.account.none")} />
              </div>
            ) : (
              <Skeleton className="h-16" />
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

/** ui-spec §7.6: action first — everything waiting on this user, one row per kind, quiet line when none. */
function NeedsActionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const reviews = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"),
    enabled: can(PERMISSIONS.EMPLOYEES_REVIEW),
  });
  const leave = useLeaveRequests({ status: "pending" }, can(PERMISSIONS.LEAVE_APPROVE) && can(PERMISSIONS.LEAVE_READ));
  const custody = useQuery({
    queryKey: ["custody", "list", ""],
    queryFn: () => apiJson<Array<{ actions?: string[] }>>("/api/v1/custody/requests"),
    enabled: can(PERMISSIONS.CUSTODY_READ),
  });
  const counts = {
    reviews: reviews.data ? reviews.data.ibans.length + reviews.data.documents.length : 0,
    leave: (leave.data ?? []).filter((r) => r.canDecide).length,
    custody: (custody.data ?? []).filter((c) => (c.actions ?? []).length > 0).length,
  };
  const loading = reviews.isLoading || leave.isLoading || custody.isLoading;
  const rows = [
    { key: "reviews", count: counts.reviews, text: t("home.pendingReviews", { count: counts.reviews }), to: "/review-queue", label: t("home.openReviewQueue") },
    { key: "leave", count: counts.leave, text: t("home.pendingLeave", { count: counts.leave }), to: "/leave?tab=approvals", label: t("home.openLeave") },
    { key: "custody", count: counts.custody, text: t("home.pendingCustody", { count: counts.custody }), to: "/custody?tab=manage", label: t("home.openCustody") },
  ].filter((r) => r.count > 0);
  return (
    <Panel>
      <PanelHeader title={t("home.needsAction")} />
      {loading ? (
        <Skeleton className="h-10" />
      ) : rows.length > 0 ? (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <ActionRow
              key={r.key}
              text={r.text}
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link to={r.to}>{r.label}</Link>
                </Button>
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-muted">{t("home.nothingToDo")}</p>
      )}
    </Panel>
  );
}

/** Present / late / absent / not yet today, for whoever the viewer's scope covers. */
function AttendanceTodayPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const board = useBoard(todayInRiyadh(), "");
  const rows = board.data?.rows ?? [];
  const count = (state: string): number => rows.filter((r) => r.state === state).length;
  return (
    <Panel>
      <PanelHeader
        title={t("home.attendanceToday")}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/attendance">{t("home.viewAll")}</Link>
          </Button>
        }
      />
      {board.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={count("present")} label={t("attendance.status.present")} />
          <Stat value={count("late")} label={t("attendance.status.late")} />
          <Stat value={count("absent")} label={t("attendance.status.absent")} />
          <Stat value={count("not_yet")} label={t("attendance.status.not_yet")} />
        </div>
      ) : (
        <Skeleton className="h-16" />
      )}
    </Panel>
  );
}

/** The employee's own day with a shortcut to the check-in screen. */
function MyTodayPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const today = useToday();
  const day = today.data?.day ?? null;
  const checkedIn = today.data?.punches.at(-1)?.kind === "in";
  return (
    <Panel>
      <PanelHeader
        title={t("home.myAttendance")}
        actions={today.data && <AttendanceBadge state={day?.status ?? (today.data.kind === "working" ? "not_yet" : today.data.kind)} />}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-body tabular-nums text-ink-muted">
          {t("attendance.in")} <bdi className="font-medium text-ink">{formatTime(day?.firstInAt ?? null)}</bdi> · {t("attendance.out")}{" "}
          <bdi className="font-medium text-ink">{formatTime(day?.lastOutAt ?? null)}</bdi>
        </p>
        <Button asChild size="lg" className="w-full sm:h-10 sm:w-auto" variant={checkedIn ? "secondary" : "primary"}>
          <Link to="/my-attendance">{checkedIn ? t("attendance.checkOut") : t("attendance.checkIn")}</Link>
        </Button>
      </div>
    </Panel>
  );
}

function CheckItem({ label, done, tone, status, to }: { label: string; done: boolean; tone: Tone; status: string; to: string }): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <Link to={to} className="flex min-h-11 flex-1 items-center text-body text-ink hover:text-primary">
        {label}
      </Link>
      <Badge tone={done ? "success" : tone} dot>
        {status}
      </Badge>
    </li>
  );
}

/** Mobile-first: "complete your profile" until done, then document statuses and latest notifications. */
function EmployeeDashboard({ me }: { me: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const docs = useQuery({ queryKey: ["me", "documents"], queryFn: () => apiJson<EmployeeDocument[]>("/api/v1/me/documents") });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiJson<{ items: AppNotification[] }>("/api/v1/notifications?limit=20"),
  });

  const hasPhone = Boolean(me.phone);
  const ibanState = me.iban ? "approved" : me.ibanReviewStatus;
  const docList = docs.data ?? [];
  const hasApprovedDoc = docList.some((d) => d.reviewStatus === "approved");
  const complete = hasPhone && ibanState === "approved" && hasApprovedDoc;

  const statusFor = (state: string | null | undefined): { tone: Tone; text: string } =>
    state === "pending_review"
      ? { tone: "warning", text: t("review.status.pending_review") }
      : state === "rejected"
        ? { tone: "danger", text: t("review.status.rejected") }
        : { tone: "neutral", text: t("home.missing") };

  const iban = statusFor(ibanState);
  const docPending = docList.some((d) => d.reviewStatus === "pending_review");
  const docStatus = statusFor(docPending ? "pending_review" : docList.some((d) => d.reviewStatus === "rejected") ? "rejected" : null);

  return (
    <>
      {can(PERMISSIONS.ATTENDANCE_PUNCH) && <MyTodayPanel />}
      {!complete && docs.data && (
        <Panel>
          <PanelHeader title={t("home.completeProfile")} />
          <ul className="divide-y divide-line">
            <CheckItem label={t("employees.fields.phone")} done={hasPhone} tone="neutral" status={hasPhone ? t("home.done") : t("home.missing")} to="/profile" />
            <CheckItem label={t("employees.fields.iban")} done={ibanState === "approved"} tone={iban.tone} status={ibanState === "approved" ? t("review.status.approved") : iban.text} to="/profile" />
            <CheckItem label={t("documents.title")} done={hasApprovedDoc} tone={docStatus.tone} status={hasApprovedDoc ? t("review.status.approved") : docStatus.text} to="/profile" />
          </ul>
        </Panel>
      )}

      {complete && (
        <Panel>
          <PanelHeader title={t("profile.documents.title")} />
          <ul className="divide-y divide-line">
            {docList.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-body">{t(`documents.types.${d.type}`)}</span>
                <Badge tone={d.reviewStatus === "approved" ? "success" : d.reviewStatus === "pending_review" ? "warning" : "danger"}>
                  {t(`review.status.${d.reviewStatus}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
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
    </>
  );
}
