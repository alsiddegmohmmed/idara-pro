import {
  COMPANY_SETTING_KEYS,
  DEFAULT_MAX_DEDUCTION_PERCENT,
  PERMISSIONS,
  WARNING_ACTION_LIMIT_DAYS,
  WARNING_TYPES,
  deductionCapHalalas,
  type AdjustmentView,
  type ShortLeaveView,
  type WarningView,
} from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PanelFacts, PanelSection } from "@/components/review-panel";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth";
import { useEmployees } from "@/features/employees/api";
import { downloadFile } from "@/features/employees/documents";
import { nameIn } from "@/features/employees/employee-name";
import { useLeaveBalances, useLeaveRequests, type LeaveRequest } from "@/features/leave/api";
import { LeaveBadge, useTypeName } from "@/features/leave/leave-badge";
import type { CompanySetting, Holiday } from "@/features/setup/api";
import { apiJson } from "@/lib/api";
import { formatDateRange, formatDuration } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import { AllowanceBar, DayTimeline, useEmployeeAllowance, Window } from "@/features/shortleave/shared";
import { WarningStatement } from "@/features/discipline/warnings";
import type { SalaryComponent } from "@/lib/types";

// ux-redesign-v2 §2.1: what each review panel shows so the decision can be made from the panel.
// Every block reads an endpoint the module pages already use (same query keys, so it's usually cached),
// and each one is skipped when the user lacks the permission behind it.

/** A date `months` months before `date` (YYYY-MM-DD), same day of month. */
function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function Loading(): React.JSX.Element {
  return <Skeleton className="h-16" />;
}

// ---------------- leave ----------------

export function LeaveContext({ request }: { request: LeaveRequest }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const typeName = useTypeName();
  const employeeId = request.employee?.id;
  const year = Number(request.startDate.slice(0, 4));

  const balances = useLeaveBalances(year, Boolean(employeeId), employeeId);
  const history = useLeaveRequests({ employeeId, from: monthsBefore(request.startDate, 12), to: request.endDate }, Boolean(employeeId));
  const overlapping = useLeaveRequests({ from: request.startDate, to: request.endDate });
  const employees = useEmployees();
  const holidays = useQuery({
    queryKey: ["holidays"],
    queryFn: () => apiJson<Holiday[]>("/api/v1/holidays"),
    enabled: can(PERMISSIONS.ORG_READ),
  });

  const myBalances = balances.data?.rows.find((r) => r.employee.id === employeeId)?.balances ?? [];
  const balance = myBalances.find((b) => b.leaveType.id === request.leaveType.id);
  // What approval checks (leave-requests.service): entitlement minus days already used — other pending
  // requests don't block this one (first come, first served). `availableDays` holds them back and is
  // clamped at 0, so it can't show a balance going negative.
  const before = balance && balance.entitledDays !== null ? balance.entitledDays - balance.usedDays : null;
  const after = before === null ? null : before - request.days;
  const otherPending = balance ? balance.pendingDays - request.days : 0;

  const departmentOf = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e.departmentId])), [employees.data]);
  // null (no department) is treated like unknown: "same department" would otherwise mean "also without one".
  const myDepartment = (employeeId ? departmentOf.get(employeeId) : undefined) ?? undefined;
  const othersOff = (overlapping.data ?? []).filter(
    (r) =>
      r.employee &&
      r.employee.id !== employeeId &&
      (r.status === "approved" || r.status === "pending") &&
      // Same department when we know it; otherwise everyone the approver can see.
      (myDepartment === undefined || departmentOf.get(r.employee.id) === myDepartment),
  );
  const holidaysInside = (holidays.data ?? []).filter((h) => h.date.slice(0, 10) >= request.startDate && h.date.slice(0, 10) <= request.endDate);
  const past = (history.data ?? []).filter((r) => r.employee?.id === employeeId && r.id !== request.id && r.status !== "cancelled");
  const rejections = past.filter((r) => r.status === "rejected").length;

  return (
    <>
      <PanelFacts
        items={[
          { label: t("leave.type"), value: typeName(request.leaveType) },
          { label: t("leave.days"), value: <span className="tabular-nums">{request.days}</span> },
          { label: t("leave.dates"), value: <bdi className="tabular-nums">{formatDateRange(request.startDate, request.endDate)}</bdi> },
          { label: t("panel.submitted"), value: <bdi className="tabular-nums">{request.createdAt.slice(0, 10)}</bdi> },
          request.reason ? { label: t("leave.reason"), value: <span className="whitespace-pre-line font-normal">{request.reason}</span> } : null,
          request.attachment
            ? {
                label: t("panel.attachment"),
                value: (
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline"
                    onClick={() => request.attachment && void downloadFile(`/api/v1/leave/requests/${request.id}/attachment`, request.attachment.name)}
                  >
                    <Paperclip className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{request.attachment.name}</span>
                  </button>
                ),
              }
            : null,
        ]}
      />
      {request.leaveType.requiresAttachment && !request.attachment && <Alert tone="warning">{t("leave.errors.attachment_required")}</Alert>}

      <PanelSection title={t("panel.leave.balance")}>
        {balances.isLoading ? (
          <Loading />
        ) : !request.leaveType.deductsBalance || before === null || after === null ? (
          <p className="text-dense text-ink-muted">{t("panel.leave.noBalance")}</p>
        ) : (
          <div className="flex items-center gap-3 rounded-panel border border-line p-4">
            <div>
              <p className="text-meta text-ink-muted">{t("panel.leave.before")}</p>
              <p className="text-section tabular-nums">{before}</p>
            </div>
            <span aria-hidden className="inline-block text-ink-muted ltr:rotate-180">←</span>
            <div>
              <p className="text-meta text-ink-muted">{t("panel.leave.after")}</p>
              <p className={`text-section tabular-nums ${after < 0 ? "text-danger" : ""}`}>{after}</p>
            </div>
            {after < 0 && <Badge tone="danger">{t("panel.leave.negative")}</Badge>}
          </div>
        )}
        {otherPending > 0 && <p className="mt-2 text-meta text-ink-muted">{t("panel.leave.otherPending", { count: otherPending })}</p>}
        {myBalances.some((b) => b.usedDays > 0) && (
          <p className="mt-2 text-meta text-ink-muted">
            {t("panel.leave.takenThisYear", { year })}{" "}
            {myBalances
              .filter((b) => b.usedDays > 0)
              .map((b) => t("panel.leave.takenItem", { type: typeName(b.leaveType), days: b.usedDays }))
              .join(" · ")}
          </p>
        )}
      </PanelSection>

      <PanelSection title={t("panel.leave.othersOff")} aside={myDepartment !== undefined ? t("panel.leave.sameDepartment") : undefined}>
        {overlapping.isLoading ? (
          <Loading />
        ) : othersOff.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.leave.nobodyOff")}</p>
        ) : (
          <ul className="space-y-2">
            {othersOff.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-dense">
                {r.employee && <Avatar name={r.employee.fullNameAr} size="sm" />}
                <span className="min-w-0 flex-1 truncate">{r.employee && nameIn(i18n, r.employee)}</span>
                <bdi className="tabular-nums text-meta text-ink-muted">{formatDateRange(r.startDate, r.endDate)}</bdi>
                {r.status === "pending" && <Badge tone="warning">{t("common.view.pending")}</Badge>}
              </li>
            ))}
          </ul>
        )}
        {holidaysInside.length > 0 && (
          <p className="mt-2 text-meta text-ink-muted">
            {t("panel.leave.holidaysInside")} {new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(holidaysInside.map((h) => h.name))}
          </p>
        )}
      </PanelSection>

      <PanelSection title={t("panel.leave.history")} aside={rejections > 0 ? t("panel.leave.rejections", { count: rejections }) : undefined}>
        {history.isLoading ? (
          <Loading />
        ) : past.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.leave.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line">
            {[...past]
              .sort((a, b) => b.startDate.localeCompare(a.startDate))
              .slice(0, 10)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-dense">
                  <span className="min-w-0 flex-1 truncate">{typeName(r.leaveType)}</span>
                  <bdi className="tabular-nums text-meta text-ink-muted">{formatDateRange(r.startDate, r.endDate)}</bdi>
                  <LeaveBadge status={r.status} />
                </li>
              ))}
          </ul>
        )}
      </PanelSection>
    </>
  );
}

// ---------------- custody ----------------

interface CustodyRow {
  id: string;
  employee: { id: string } | null;
  amountHalalas: string;
  purpose: string;
  status: string;
  settledAmountHalalas: string | null;
  createdAt: string;
}

/** Money the employee holds and hasn't settled yet (business-rules "Custody"): paid out, not settled. */
const OPEN_CUSTODY = new Set(["paid"]);

export function CustodyContext({ custody }: { custody: { id: string; employee: { id: string } | null; amountHalalas: string; purpose: string; status: string; createdAt: string } }): React.JSX.Element {
  const { t } = useTranslation();
  const employeeId = custody.employee?.id;
  const history = useQuery({
    queryKey: ["custody", "list", "employee", employeeId],
    queryFn: () => apiJson<CustodyRow[]>(`/api/v1/custody/requests?employeeId=${employeeId}`),
    enabled: Boolean(employeeId),
  });
  const others = (history.data ?? []).filter((c) => c.id !== custody.id);
  const open = others.filter((c) => OPEN_CUSTODY.has(c.status));
  const unsettled = open.reduce((sum, c) => sum + BigInt(c.amountHalalas), 0n);

  return (
    <>
      <PanelFacts
        items={[
          { label: t("panel.custody.amount"), value: <bdi className="tabular-nums">{formatHalalas(custody.amountHalalas)} {t("employees.salary.sar")}</bdi> },
          { label: t("panel.custody.status"), value: t(`custody.status.${custody.status}`) },
          { label: t("panel.custody.purpose"), value: <span className="whitespace-pre-line font-normal">{custody.purpose}</span> },
          { label: t("panel.submitted"), value: <bdi className="tabular-nums">{custody.createdAt.slice(0, 10)}</bdi> },
        ]}
      />
      <PanelSection title={t("panel.custody.open")}>
        {history.isLoading ? (
          <Loading />
        ) : open.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.custody.noneOpen")}</p>
        ) : (
          <Alert tone="warning">{t("panel.custody.unsettled", { count: open.length, amount: formatHalalas(unsettled.toString()) })}</Alert>
        )}
      </PanelSection>
      <PanelSection title={t("panel.custody.history")}>
        {history.isLoading ? (
          <Loading />
        ) : others.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.custody.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line">
            {others.slice(0, 10).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-dense">
                <span className="min-w-0 flex-1 truncate">{c.purpose}</span>
                <bdi className="tabular-nums">{formatHalalas(c.amountHalalas)}</bdi>
                <span className="text-meta text-ink-muted">{t(`custody.status.${c.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </>
  );
}

// ---------------- adjustment ----------------

/** The month's pay as the cap check sees it: salary components in force on the 1st of the month (YYYY-MM). */
function monthlyPay(components: SalaryComponent[], period: string): bigint {
  const first = `${period}-01`;
  return components
    .filter((c) => c.effectiveFrom.slice(0, 10) <= first && (!c.effectiveTo || c.effectiveTo.slice(0, 10) >= first))
    .reduce((sum, c) => sum + BigInt(c.amountHalalas), 0n);
}

export function AdjustmentContext({ adjustment }: { adjustment: AdjustmentView }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const employeeId = adjustment.employee?.id;
  const sameMonth = useQuery({
    queryKey: ["adjustments", adjustment.period, "employee", employeeId],
    queryFn: () => apiJson<AdjustmentView[]>(`/api/v1/adjustments?period=${adjustment.period}&employeeId=${employeeId}`),
    enabled: Boolean(employeeId),
  });
  const salary = useQuery({
    queryKey: ["salary", employeeId],
    queryFn: () => apiJson<SalaryComponent[]>(`/api/v1/employees/${employeeId}/salary-components`),
    enabled: Boolean(employeeId) && can(PERMISSIONS.SALARY_READ),
  });
  const settings = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => apiJson<CompanySetting[]>("/api/v1/company-settings"),
    enabled: can(PERMISSIONS.ORG_READ),
  });

  const others = (sameMonth.data ?? []).filter((a) => a.id !== adjustment.id && a.status !== "rejected");
  const pay = salary.data ? monthlyPay(salary.data, adjustment.period) : null;
  // Exactly what approval checks (adjustments.service): the cap setting in force on the 1st of the month
  // (50% when none), against the month's *approved* deductions plus this one.
  const first = `${adjustment.period}-01`;
  const capSetting = (settings.data ?? [])
    .filter((s) => s.key === COMPANY_SETTING_KEYS.MAX_DEDUCTION_PERCENT && s.effectiveFrom.slice(0, 10) <= first)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const capPercent = !settings.isSuccess ? null : typeof capSetting?.value === "number" ? capSetting.value : DEFAULT_MAX_DEDUCTION_PERCENT;
  const deductions =
    others.filter((a) => a.kind === "deduction" && a.status === "approved").reduce((sum, a) => sum + BigInt(a.amountHalalas), 0n) +
    (adjustment.kind === "deduction" ? BigInt(adjustment.amountHalalas) : 0n);
  const cap = pay !== null && capPercent !== null ? deductionCapHalalas(pay, capPercent) : null;

  return (
    <>
      <PanelFacts
        items={[
          { label: t("panel.adjustment.kind"), value: t(`adjustments.kinds.${adjustment.kind}`) },
          { label: t("panel.adjustment.amount"), value: <bdi className="tabular-nums">{formatHalalas(adjustment.amountHalalas)} {t("employees.salary.sar")}</bdi> },
          { label: t("panel.adjustment.period"), value: <bdi className="tabular-nums">{adjustment.period}</bdi> },
          { label: t("panel.submitted"), value: <bdi className="tabular-nums">{adjustment.createdAt.slice(0, 10)}</bdi> },
          { label: t("panel.adjustment.reason"), value: <span className="whitespace-pre-line font-normal">{adjustment.reason}</span> },
        ]}
      />
      {pay !== null && (
        <PanelSection title={t("panel.adjustment.pay")}>
          <p className="text-section tabular-nums">
            <bdi>{formatHalalas(pay.toString())}</bdi> <span className="text-dense text-ink-muted">{t("employees.salary.sar")}</span>
          </p>
          {adjustment.kind === "deduction" && (
            <p className="mt-1 text-meta text-ink-muted">
              {t("panel.adjustment.deductionsTotal", { amount: formatHalalas(deductions.toString()) })}
              {cap !== null && ` · ${t("panel.adjustment.cap", { percent: capPercent, amount: formatHalalas(cap.toString()) })}`}
            </p>
          )}
          {adjustment.kind === "deduction" && cap !== null && deductions > cap && <Alert tone="warning" className="mt-2">{t("panel.adjustment.overCap")}</Alert>}
        </PanelSection>
      )}
      <PanelSection title={t("panel.adjustment.sameMonth")}>
        {sameMonth.isLoading ? (
          <Loading />
        ) : others.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.adjustment.noOthers")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line">
            {others.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-dense">
                <span className="min-w-0 flex-1 truncate">
                  {t(`adjustments.kinds.${a.kind}`)} · {a.reason}
                </span>
                <bdi className="tabular-nums">{formatHalalas(a.amountHalalas)}</bdi>
                <span className="text-meta text-ink-muted">{t(`adjustments.statuses.${a.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </>
  );
}

// ---------------- anything else ----------------

/** Kinds without their own context yet (reviews, payroll): the request itself. */
export function BasicContext({ title, detail, submittedAt }: { title: string; detail: string; submittedAt: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PanelFacts
      items={[
        { label: t("panel.request"), value: title },
        { label: t("panel.submitted"), value: <bdi className="tabular-nums">{submittedAt.slice(0, 10)}</bdi> },
        detail ? { label: t("panel.details"), value: <bdi className="whitespace-pre-line font-normal">{detail}</bdi> } : null,
      ]}
    />
  );
}

// ---------------- short permission ----------------

/**
 * The day's shift with the requested window on it, the month's allowance (what is left after approval —
 * approving moves already-reserved pending minutes to used), this month's permissions and late days.
 */
export function ShortLeaveContext({ request }: { request: ShortLeaveView }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const employeeId = request.employee?.id;
  const month = request.date.slice(0, 7);
  const allowance = useEmployeeAllowance(employeeId, month, request.id);
  const history = useQuery({
    queryKey: ["shortleave", "list", "employee", employeeId, "all"],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests?employeeId=${employeeId}`),
    enabled: Boolean(employeeId),
  });
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const days = useQuery({
    queryKey: ["attendance", "days", employeeId, month],
    queryFn: () => apiJson<Array<{ day: { status: string | null; lateMin: number } }>>(`/api/v1/attendance/days?from=${month}-01&to=${last}&employeeId=${employeeId}`),
    enabled: Boolean(employeeId) && can(PERMISSIONS.ATTENDANCE_READ),
  });
  const thisMonth = (history.data ?? []).filter((r) => r.id !== request.id && r.date.startsWith(month) && r.status !== "cancelled");
  const lateDays = (days.data ?? []).filter((d) => d.day.status === "late");
  return (
    <>
      <PanelFacts
        items={[
          { label: t("shortleave.kind"), value: t(`shortleave.kinds.${request.kind}`) },
          { label: t("shortleave.date"), value: <bdi className="tabular-nums">{request.date}</bdi> },
          { label: t("shortleave.time"), value: <Window r={request} /> },
          { label: t("panel.submitted"), value: <bdi className="tabular-nums">{request.createdAt.slice(0, 10)}</bdi> },
          { label: t("shortleave.reason"), value: <span className="whitespace-pre-line font-normal">{request.reason}</span> },
        ]}
      />
      <PanelSection title={t("panel.shortleave.day")}>
        {allowance.isLoading ? <Loading /> : <DayTimeline schedule={allowance.data?.schedule ?? null} from={request.fromTime} to={request.toTime} />}
      </PanelSection>
      <PanelSection title={t("panel.shortleave.allowance")}>
        {allowance.isLoading ? (
          <Loading />
        ) : allowance.data ? (
          <>
            <AllowanceBar a={allowance.data} />
            <p className="mt-2 text-dense text-ink">
              {t("shortleave.remainingAfter", { time: formatDuration(allowance.data.remainingMinutes), total: formatDuration(allowance.data.allowanceMinutes) })}
            </p>
          </>
        ) : null}
      </PanelSection>
      <PanelSection title={t("panel.shortleave.thisMonth")} aside={days.data ? t("panel.shortleave.lateDays", { count: lateDays.length }) : undefined}>
        {history.isLoading ? (
          <Loading />
        ) : thisMonth.length === 0 ? (
          <p className="text-dense text-ink-muted">{t("panel.shortleave.noneThisMonth")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line">
            {thisMonth.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-dense">
                <span className="min-w-0 flex-1 truncate">{t(`shortleave.kinds.${r.kind}`)}</span>
                <bdi className="tabular-nums text-meta text-ink-muted">{r.date}</bdi>
                <span className="text-meta text-ink-muted">
                  <Window r={r} />
                </span>
                <span className="text-meta text-ink-muted">{t(`shortleave.statuses.${r.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </>
  );
}

// ---------------- warning ----------------

const DAY_MS = 86_400_000;
const riyadhToday = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * What HR needs to issue a warning fairly (business-rules.md "Warnings"): the 30-day countdown from the
 * incident (a reminder — the law counts from discovery), earlier warnings with a suggested next step (reference
 * only; the ladder is company policy), the last 30 days of attendance, and the employee's statement.
 */
export function WarningContext({ warning }: { warning: WarningView }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const employeeId = warning.employee?.id;
  const today = riyadhToday();
  const elapsed = daysBetween(warning.incidentDate, today);
  const left = WARNING_ACTION_LIMIT_DAYS - elapsed;

  const history = useQuery({
    queryKey: ["warnings", "", employeeId ?? ""],
    queryFn: () => apiJson<WarningView[]>(`/api/v1/warnings?employeeId=${employeeId}`),
    enabled: Boolean(employeeId),
  });
  const since = addDays(today, -180);
  const prior = (history.data ?? []).filter((w) => w.id !== warning.id && w.status === "issued" && w.incidentDate >= since);
  const highest = prior.reduce((max, w) => Math.max(max, WARNING_TYPES.indexOf(w.type)), -1);
  const suggested = WARNING_TYPES[Math.min(highest + 1, WARNING_TYPES.length - 1)];

  const from = addDays(today, -29);
  const days = useQuery({
    queryKey: ["attendance", "days", employeeId, from, today],
    queryFn: () => apiJson<Array<{ day: { status: string | null } }>>(`/api/v1/attendance/days?from=${from}&to=${today}&employeeId=${employeeId}`),
    enabled: Boolean(employeeId) && can(PERMISSIONS.ATTENDANCE_READ),
  });
  const count = (status: string): number => (days.data ?? []).filter((d) => d.day.status === status).length;

  return (
    <>
      <PanelFacts
        items={[
          { label: t("discipline.type"), value: t(`discipline.types.${warning.type}`) },
          { label: t("discipline.incidentDate"), value: <bdi className="tabular-nums">{warning.incidentDate}</bdi> },
          warning.proposedBy ? { label: t("discipline.proposedBy"), value: nameIn(i18n, warning.proposedBy) } : null,
          { label: t("panel.submitted"), value: <bdi className="tabular-nums">{warning.createdAt.slice(0, 10)}</bdi> },
          { label: t("discipline.reason"), value: <span className="whitespace-pre-line font-normal">{warning.reason}</span> },
        ]}
      />
      <PanelSection title={t("panel.warning.deadline")}>
        {left >= 0 ? (
          <p className="text-dense text-ink">{t("panel.warning.daysLeft", { n: left, total: WARNING_ACTION_LIMIT_DAYS })}</p>
        ) : (
          <Alert tone="warning">{t("panel.warning.overdue", { n: elapsed, total: WARNING_ACTION_LIMIT_DAYS })}</Alert>
        )}
      </PanelSection>
      <PanelSection title={t("discipline.statement.title")}>
        <WarningStatement warning={warning} />
      </PanelSection>
      <PanelSection title={t("panel.warning.prior")}>
        {history.isLoading ? (
          <Loading />
        ) : (
          <>
            {prior.length === 0 ? (
              <p className="text-dense text-ink-muted">{t("panel.warning.noPrior")}</p>
            ) : (
              <ul className="divide-y divide-line rounded-panel border border-line">
                {prior.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-3 py-2 text-dense">
                    <span className="shrink-0">{t(`discipline.types.${w.type}`)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{w.reason}</span>
                    <bdi className="tabular-nums text-meta text-ink-muted">{w.incidentDate}</bdi>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-dense text-ink">{t("panel.warning.suggested", { type: t(`discipline.types.${suggested}`) })}</p>
            <p className="text-meta text-ink-muted">{t("panel.warning.suggestedHint")}</p>
          </>
        )}
      </PanelSection>
      {can(PERMISSIONS.ATTENDANCE_READ) && (
        <PanelSection title={t("panel.warning.attendance")}>
          {days.isLoading ? <Loading /> : <p className="text-dense text-ink">{t("panel.warning.attendanceSummary", { late: count("late"), absent: count("absent") })}</p>}
        </PanelSection>
      )}
    </>
  );
}
