import { PERMISSIONS, type AuditEntryView, type ContractView, type ShortLeaveView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useLeaveBalances, useLeaveRequests } from "@/features/leave/api";
import { LeaveBadge, useTypeName } from "@/features/leave/leave-badge";
import type { AttendanceDay, AttendanceStatus, EmployeeRef as AttendanceEmployeeRef } from "@/features/attendance/api";
import { apiJson } from "@/lib/api";
import { formatDateRange, formatDateTime, todayInRiyadh } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import type { Employee, EmployeeDocument } from "@/lib/types";
import { cn } from "@/lib/utils";
import { nameIn } from "./employee-name";
import { MaskedValue } from "./record-header";

// ux-redesign-v2 §4: the employee record. The rail is the identity, the overview is the state, the
// tabs are the detail. Every block reads an endpoint the module pages already use (same query keys)
// and is left out when the user lacks the permission behind it.

const SOON_DAYS = 30;
const EXPIRY_NOTICE_DAYS = 60;

const daysUntil = (from: string, to: string): number =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** "منذ 3 سنوات" style tenure, in the reader's language with Latin digits. */
export function useTenure(hireDate: string): string {
  const { i18n } = useTranslation();
  const rtf = new Intl.RelativeTimeFormat(i18n.language === "ar" ? "ar-u-nu-latn" : "en", { numeric: "auto" });
  const days = daysUntil(hireDate, todayInRiyadh());
  const text =
    days < 31 ? rtf.format(-Math.max(days, 0), "day") : days < 365 ? rtf.format(-Math.floor(days / 30.44), "month") : rtf.format(-Math.floor(days / 365.25), "year");
  // Tenure reads "منذ سنتين" (since), not Intl's "قبل سنتين" (ago).
  return i18n.language === "ar" ? text.replace(/^قبل /, "منذ ") : text;
}

// ---------------- rail ----------------

function CopyValue({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <bdi dir="ltr" className="truncate">
        {value}
      </bdi>
      <button
        type="button"
        className="grid size-7 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-canvas hover:text-ink"
        aria-label={t("employees.rail.copy", { what: label })}
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => toast.success(t("employees.rail.copied")),
            () => undefined,
          )
        }
      >
        <Copy className="size-4" aria-hidden />
      </button>
    </span>
  );
}

function RailFact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element | null {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-dense font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * Who this is, at a glance: sticky on the inline-start side on desktop, a compact header on phones.
 * Quick actions sit under the identity.
 */
export function SummaryRail({
  e,
  department,
  branch,
  manager,
  actions,
}: {
  e: Employee;
  department?: string;
  branch?: string;
  manager?: Employee;
  actions: ReactNode;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const tenure = useTenure(e.hireDate);
  return (
    <aside className="rounded-panel border border-line bg-surface lg:sticky lg:top-20">
      <div className="flex items-start gap-4 p-5 lg:flex-col lg:items-center lg:text-center">
        <Avatar name={e.fullNameAr} size="lg" />
        <div className="min-w-0 flex-1 lg:w-full">
          <h1 className="text-section text-ink lg:text-page-title">{nameIn(i18n, e)}</h1>
          {e.jobTitle && <p className="mt-0.5 text-dense text-ink-muted">{e.jobTitle}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 lg:justify-center">
            <Badge tone={e.status === "active" ? "success" : "neutral"} dot>
              {t(`employees.status.${e.status}`)}
            </Badge>
            {!e.userId && <Badge tone="neutral">{t("employees.account.none")}</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 lg:justify-center">{actions}</div>
      {/* Phones: a compact header — the facts live in the الوظيفة / البيانات الشخصية tabs. */}
      <dl className="hidden gap-x-4 gap-y-3 border-t border-line p-5 lg:grid lg:grid-cols-1">
        <RailFact label={t("employees.fields.employeeNo")}>
          <bdi>{e.employeeNo}</bdi>
        </RailFact>
        <RailFact label={t("employees.fields.department")}>{department}</RailFact>
        <RailFact label={t("employees.fields.manager")}>
          {manager && (
            <Link to={`/employees/${manager.id}`} className="text-primary underline-offset-4 hover:underline">
              {nameIn(i18n, manager)}
            </Link>
          )}
        </RailFact>
        <RailFact label={t("employees.fields.branch")}>{branch}</RailFact>
        <RailFact label={t("employees.fields.hireDate")}>
          <bdi className="tabular-nums">{e.hireDate.slice(0, 10)}</bdi> <span className="font-normal text-ink-muted">· {tenure}</span>
        </RailFact>
        <RailFact label={t("employees.fields.nationalId")}>
          <MaskedValue value={e.nationalId} />
        </RailFact>
        <RailFact label={t("employees.fields.phone")}>{e.phone && <CopyValue value={e.phone} label={t("employees.fields.phone")} />}</RailFact>
        <RailFact label={t("employees.fields.personalEmail")}>
          {e.personalEmail && <CopyValue value={e.personalEmail} label={t("employees.fields.personalEmail")} />}
        </RailFact>
      </dl>
    </aside>
  );
}

// ---------------- sections ----------------

/** A titled panel with its own pencil: editing opens just this section's form (ux-redesign-v2 §4). */
export function Section({ title, editTo, children }: { title: string; editTo?: string; children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-subsection text-ink">{title}</h2>
        {editTo && (
          <Button asChild variant="ghost" size="sm" icon={<Pencil />}>
            <Link to={editTo} aria-label={t("employees.rail.editSection", { section: title })}>
              {t("common.edit")}
            </Link>
          </Button>
        )}
      </div>
      {children}
    </Panel>
  );
}

// ---------------- overview ----------------

interface Notice {
  key: string;
  tone: "warning" | "danger" | "info";
  text: string;
  to?: string;
}

interface CustodyRow {
  id: string;
  amountHalalas: string;
  purpose: string;
  status: string;
}

const CELL: Record<AttendanceStatus, string> = {
  present: "bg-success",
  late: "bg-warning",
  absent: "bg-danger",
  leave: "bg-info",
  holiday: "bg-line-strong",
  weekend: "bg-line",
};

/** نظرة عامة: what needs action, this month's attendance, leave balances and open requests. */
export function OverviewTab({ e, onTab }: { e: Employee; onTab: (tab: string) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const typeName = useTypeName();
  const today = todayInRiyadh();
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));

  const contractsPath = `/api/v1/employees/${e.id}/contracts`;
  const contracts = useQuery({
    queryKey: ["contracts", contractsPath],
    queryFn: () => apiJson<ContractView[]>(contractsPath),
    enabled: can(PERMISSIONS.CONTRACTS_READ),
  });
  const documents = useQuery({
    queryKey: ["documents", e.id],
    queryFn: () => apiJson<EmployeeDocument[]>(`/api/v1/employees/${e.id}/documents`),
    enabled: can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE),
  });
  const days = useQuery({
    // Not the person view's key: this one runs to today, that one to the end of the month.
    queryKey: ["attendance", "days", e.id, month, "to-today"],
    queryFn: () =>
      apiJson<Array<{ employee: AttendanceEmployeeRef; day: AttendanceDay }>>(
        `/api/v1/attendance/days?from=${month}-01&to=${today}&employeeId=${e.id}`,
      ),
    enabled: can(PERMISSIONS.ATTENDANCE_READ),
  });
  const balances = useLeaveBalances(year, true, e.id);
  const pendingLeave = useLeaveRequests({ employeeId: e.id, status: "pending" });
  const pendingShort = useQuery({
    queryKey: ["shortleave", "list", "employee", e.id, "pending"],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests?employeeId=${e.id}&status=pending`),
    enabled: can(PERMISSIONS.SHORTLEAVE_READ),
  });
  const custody = useQuery({
    queryKey: ["custody", "list", "employee", e.id],
    queryFn: () => apiJson<CustodyRow[]>(`/api/v1/custody/requests?employeeId=${e.id}`),
    enabled: can(PERMISSIONS.CUSTODY_READ),
  });

  // ---- what needs action
  const notices: Notice[] = [];
  if (e.status === "inactive") notices.push({ key: "inactive", tone: "info", text: t("employees.overview.inactive") });
  if (can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE) && !e.iban && e.status === "active") {
    notices.push({
      key: "iban",
      tone: "warning",
      text: t("employees.overview.noIban"),
      // The edit page needs employees:update; setting an IBAN directly needs employees:review.
      to: can(PERMISSIONS.EMPLOYEES_REVIEW) && can(PERMISSIONS.EMPLOYEES_UPDATE) ? `/employees/${e.id}/edit?section=bank&tab=pay` : undefined,
    });
  }
  if (e.ibanReviewStatus === "pending_review") notices.push({ key: "iban-review", tone: "info", text: t("employees.ibanWaiting"), to: "/review-queue" });
  for (const d of documents.data ?? []) {
    if (!d.expiryDate) continue;
    const left = daysUntil(today, d.expiryDate);
    if (left > EXPIRY_NOTICE_DAYS) continue;
    notices.push({
      key: `doc-${d.id}`,
      tone: left < 0 ? "danger" : "warning",
      text:
        left < 0
          ? t("employees.overview.documentExpired", { type: t(`documents.types.${d.type}`), date: d.expiryDate.slice(0, 10) })
          : t("employees.overview.documentExpiring", { type: t(`documents.types.${d.type}`), date: d.expiryDate.slice(0, 10), count: left }),
    });
  }
  const active = contracts.data?.find((c) => c.status === "active");
  if (active?.endDate) {
    const left = daysUntil(today, active.endDate);
    if (left <= EXPIRY_NOTICE_DAYS)
      notices.push({
        key: "contract",
        tone: left < 0 ? "danger" : "warning",
        text: left < 0 ? t("employees.overview.contractEnded", { date: active.endDate }) : t("employees.overview.contractEnding", { date: active.endDate, count: left }),
      });
  }
  // Probation belongs to the contract (business-rules "Contracts"): the API stores its end date when the
  // contract is created (company default applied there), so the active contract's date is the only source.
  const probationEnd = active?.probationEndDate ?? null;
  if (probationEnd && e.status === "active") {
    const left = daysUntil(today, probationEnd);
    if (left >= 0 && left <= SOON_DAYS)
      notices.push({ key: "probation", tone: "warning", text: t("employees.overview.probationEnding", { date: probationEnd.slice(0, 10), count: left }) });
  }

  // ---- this month's attendance
  const monthDays = (days.data ?? []).map((r) => r.day).sort((a, b) => a.workDate.localeCompare(b.workDate));
  const count = (s: AttendanceStatus): number => monthDays.filter((d) => d.status === s).length;
  const worked = count("present") + count("late");
  const rate = worked + count("absent") > 0 ? Math.round((worked / (worked + count("absent"))) * 100) : null;

  // ---- open requests
  const openCustody = (custody.data ?? []).filter((c) => ["requested", "approved", "paid"].includes(c.status));
  const myBalances = balances.data?.rows.find((r) => r.employee.id === e.id)?.balances ?? [];

  return (
    <div className="space-y-6">
      {notices.length > 0 && (
        <ul className="space-y-2" aria-label={t("employees.overview.needsAction")}>
          {notices.map((n) => (
            <li
              key={n.key}
              className={cn(
                "flex items-center gap-3 rounded-panel border px-4 py-3 text-dense",
                n.tone === "danger" ? "border-danger/30 bg-danger-soft" : n.tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-info/30 bg-info-soft",
              )}
            >
              <AlertTriangle className={cn("size-4 shrink-0", n.tone === "danger" ? "text-danger" : n.tone === "warning" ? "text-warning" : "text-info")} aria-hidden />
              <span className="flex-1">{n.text}</span>
              {n.to && (
                <Link to={n.to} className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
                  {t("employees.overview.fix")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {can(PERMISSIONS.ATTENDANCE_READ) && (
          <Panel>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-subsection text-ink">{t("employees.overview.attendance")}</h2>
              <button type="button" className="text-dense text-primary underline-offset-4 hover:underline" onClick={() => onTab("time")}>
                {t("employees.overview.more")}
              </button>
            </div>
            {days.isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <p className="text-page-title tabular-nums text-ink">{rate === null ? "—" : `${rate}%`}</p>
                  <p className="text-meta text-ink-muted">
                    {t("employees.overview.attendanceCounts", { late: count("late"), absent: count("absent"), leave: count("leave") })}
                  </p>
                </div>
                {monthDays.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
                    {monthDays.map((d) => (
                      <span key={d.id} title={d.workDate.slice(0, 10)} className={cn("h-6 w-3 rounded-sm", d.status ? CELL[d.status] : "bg-line")} />
                    ))}
                  </div>
                )}
              </>
            )}
          </Panel>
        )}

        {can(PERMISSIONS.LEAVE_READ) && (
          <Panel>
            <h2 className="mb-3 text-subsection text-ink">{t("employees.overview.leaveBalance", { year })}</h2>
            {balances.isLoading ? (
              <Skeleton className="h-20" />
            ) : myBalances.length === 0 ? (
              <p className="text-dense text-ink-muted">{t("employees.overview.noBalances")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {myBalances.map((b) => (
                  <li key={b.leaveType.id} className="rounded-control border border-line p-3">
                    <p className="text-meta text-ink-muted">{typeName(b.leaveType)}</p>
                    <p className="text-section tabular-nums text-ink">
                      {/* The same "available" figure the leave pages show (pending days held back). */}
                      {b.availableDays ?? b.usedDays}
                      {b.entitledDays !== null && <span className="text-dense font-normal text-ink-muted"> / {b.entitledDays}</span>}
                    </p>
                    {b.pendingDays > 0 && <p className="text-meta text-warning">{t("employees.overview.pendingDays", { count: b.pendingDays })}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <Panel>
        <h2 className="mb-3 text-subsection text-ink">{t("employees.overview.openRequests")}</h2>
        {(pendingLeave.data?.length ?? 0) + (pendingShort.data?.length ?? 0) + openCustody.length === 0 ? (
          pendingLeave.isLoading || pendingShort.isLoading || custody.isLoading ? (
            <Skeleton className="h-12" />
          ) : (
            <p className="text-dense text-ink-muted">{t("employees.overview.noOpenRequests")}</p>
          )
        ) : (
          <ul className="divide-y divide-line">
            {(pendingLeave.data ?? []).map((r) => (
              <OpenRow key={r.id} to={r.canDecide ? `/inbox?item=leave-${r.id}` : undefined} label={typeName(r.leaveType)} detail={formatDateRange(r.startDate, r.endDate)} badge={<LeaveBadge status={r.status} />} />
            ))}
            {(pendingShort.data ?? []).map((r) => (
              <OpenRow
                key={r.id}
                to={r.canDecide ? `/inbox?item=shortleave-${r.id}` : undefined}
                label={t(`shortleave.kinds.${r.kind}`)}
                detail={`${r.date} · ${r.fromTime} – ${r.toTime}`}
                badge={<Badge tone="warning">{t("common.view.pending")}</Badge>}
              />
            ))}
            {openCustody.map((c) => (
              <OpenRow key={c.id} to="/custody?tab=manage" label={c.purpose} detail={t("employees.overview.custodyAmount", { amount: formatHalalas(c.amountHalalas) })} badge={<Badge tone={c.status === "paid" ? "info" : "warning"}>{t(`custody.status.${c.status}`)}</Badge>} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function OpenRow({ label, detail, badge, to }: { label: string; detail: string; badge: ReactNode; to?: string }): React.JSX.Element {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <bdi className="tabular-nums text-meta text-ink-muted">{detail}</bdi>
      {badge}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="flex items-center gap-3 py-2.5 text-dense hover:bg-canvas">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 py-2.5 text-dense">{body}</div>
      )}
    </li>
  );
}

// ---------------- leave & short permissions history (الحضور والإجازات) ----------------

const SHORT_TONE: Record<ShortLeaveView["status"], Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };

export function LeaveHistory({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const year = Number(todayInRiyadh().slice(0, 4));
  const list = useLeaveRequests({ employeeId, from: `${year - 1}-01-01`, to: `${year}-12-31` });
  const rows = [...(list.data ?? [])].filter((r) => r.employee?.id === employeeId).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <Section title={t("employees.time.leave")}>
      {list.isLoading ? (
        <TableSkeleton rows={3} columns={3} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("leave.noRequests")} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 20).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-dense">
              <span className="min-w-0 flex-1 truncate font-medium">{typeName(r.leaveType)}</span>
              <bdi className="tabular-nums text-meta text-ink-muted">{formatDateRange(r.startDate, r.endDate)}</bdi>
              <span className="tabular-nums text-meta text-ink-muted">{t("employees.time.days", { count: r.days })}</span>
              <LeaveBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ShortLeaveHistory({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["shortleave", "list", "employee", employeeId, "all"],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests?employeeId=${employeeId}`),
  });
  const rows = [...(list.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Section title={t("employees.time.shortleave")}>
      {list.isLoading ? (
        <TableSkeleton rows={3} columns={3} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("employees.time.noShortleave")} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 20).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-dense">
              <span className="min-w-0 flex-1 truncate font-medium">{t(`shortleave.kinds.${r.kind}`)}</span>
              <bdi dir="ltr" className="tabular-nums text-meta text-ink-muted">
                {r.date} · {r.fromTime}–{r.toTime}
              </bdi>
              <Badge tone={SHORT_TONE[r.status]}>{t(`shortleave.statuses.${r.status}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------- audit trail (الإنذارات والسجل) ----------------

/** Changes to this record (who changed what, when) — needs audit:read. */
export function RecordAudit({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const log = useQuery({
    queryKey: ["audit", "employee", employeeId],
    // Changes only: opening a record writes a "view" entry, which would otherwise crowd out the edits.
    queryFn: () => apiJson<{ items: AuditEntryView[] }>(`/api/v1/audit?entity=employees&entityId=${employeeId}&excludeAction=view&limit=30`),
  });
  const changed = (e: AuditEntryView): string[] => {
    const before = (e.before ?? {}) as Record<string, unknown>;
    const after = (e.after ?? {}) as Record<string, unknown>;
    return Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && !["updatedAt", "createdAt"].includes(k));
  };
  return (
    <Section title={t("employees.history.audit")}>
      {log.isLoading ? (
        <TableSkeleton rows={4} columns={3} />
      ) : (log.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t("audit.empty")} />
      ) : (
        <ol className="space-y-3">
          {log.data?.items.map((e) => {
            const fields = changed(e);
            return (
              <li key={e.id} className="border-s-2 border-line ps-3 text-dense">
                <p>
                  <span className="font-medium">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</span>
                  <span className="text-ink-muted"> · {e.actorEmail ? <bdi>{e.actorEmail}</bdi> : t("audit.system")}</span>
                </p>
                <p className="text-meta text-ink-muted">
                  <bdi dir="ltr" className="tabular-nums">
                    {formatDateTime(e.at)}
                  </bdi>
                  {fields.length > 0 && ` · ${list.format(fields.map((f) => t(`employees.fields.${f}`, { defaultValue: f })))}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
