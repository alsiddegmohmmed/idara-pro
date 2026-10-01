import { PERMISSIONS, COMPANY_SETTING_KEYS, type AdjustmentView } from "@idara-pro/shared";
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
import { formatDateRange } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
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

  const balances = useLeaveBalances(year);
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
  // `availableDays` already holds back every pending request, this one included.
  const after = balance?.availableDays ?? null;
  const before = after === null ? null : after + request.days;

  const departmentOf = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e.departmentId])), [employees.data]);
  const myDepartment = employeeId ? departmentOf.get(employeeId) : undefined;
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
        {myBalances.some((b) => b.usedDays > 0) && (
          <p className="mt-2 text-meta text-ink-muted">
            {t("panel.leave.takenThisYear", { year })}{" "}
            {myBalances
              .filter((b) => b.usedDays > 0)
              .map((b) => `${typeName(b.leaveType)} ${b.usedDays}`)
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
            {t("panel.leave.holidaysInside")} {holidaysInside.map((h) => h.name).join("، ")}
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

const OPEN_CUSTODY = new Set(["approved", "paid"]);

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

/** Salary components in force at any point of the month (YYYY-MM), summed — the month's pay before adjustments. */
function monthlyPay(components: SalaryComponent[], period: string): bigint {
  const first = `${period}-01`;
  const last = `${period}-31`;
  return components
    .filter((c) => c.effectiveFrom.slice(0, 10) <= last && (!c.effectiveTo || c.effectiveTo.slice(0, 10) >= first))
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
  // The cap setting in force for this month (business-rules: adjustments.max_deduction_percent, default 50%).
  const capSetting = (settings.data ?? [])
    .filter((s) => s.key === COMPANY_SETTING_KEYS.MAX_DEDUCTION_PERCENT && s.effectiveFrom.slice(0, 7) <= adjustment.period)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const capPercent = typeof capSetting?.value === "number" ? capSetting.value : null;
  const deductions =
    others.filter((a) => a.kind === "deduction").reduce((sum, a) => sum + BigInt(a.amountHalalas), 0n) +
    (adjustment.kind === "deduction" ? BigInt(adjustment.amountHalalas) : 0n);
  const cap = pay !== null && capPercent !== null ? (pay * BigInt(Math.round(capPercent))) / 100n : null;

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

/** Kinds without their own context yet (short permissions, warnings, reviews, payroll): the request itself. */
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
