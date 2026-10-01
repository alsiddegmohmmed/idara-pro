import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Banknote, CalendarDays, ChevronLeft, ClipboardCheck, FileWarning, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAttention, type AttentionKey } from "@/app/attention";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DecisionBar } from "@/components/decision-bar";
import { DecisionDialog } from "@/components/decision-dialog";
import { ReviewPanel, usePanelItem } from "@/components/review-panel";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { nameIn } from "@/features/employees/employee-name";
import { useTypeName } from "@/features/leave/leave-badge";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { AdjustmentContext, BasicContext, CustodyContext, LeaveContext, ShortLeaveContext } from "../review-contexts";
import { formatHalalas } from "@/lib/money";

interface Decision {
  path: string;
  /** Sent with the decision; `note` is added from the dialog when there is one. */
  body: Record<string, string>;
  /** The field the reason goes in ("note" or "reason"). */
  noteField: "note" | "reason";
  noteRequired: boolean;
}

/** One thing waiting on the user, whatever module it comes from. */
interface InboxItem {
  key: string;
  kind: AttentionKey;
  employee: { id: string; fullNameAr: string; fullNameEn: string } | null;
  title: string;
  detail: string;
  submittedAt: string;
  /** One-tap approve (no dialog) unless `confirmApprove`. */
  approve?: Decision;
  confirmApprove?: boolean;
  reject?: Decision;
  /** Where the full record lives (custody pay/settle and payroll are done there). */
  link: string;
  linkLabel?: string;
  /** What the review panel shows to decide from (ux-redesign-v2 §2.1); a plain request card when absent. */
  context?: React.JSX.Element;
}

const ICONS: Record<AttentionKey, LucideIcon> = {
  leave: CalendarDays,
  shortleave: AlarmClock,
  custody: Wallet,
  warnings: FileWarning,
  adjustments: Receipt,
  reviews: ClipboardCheck,
  payroll: Banknote,
};

/** The cache entries each kind lives in — invalidated after a decision so badges and pages update. */
const QUERY_KEYS: Record<AttentionKey, string[][]> = {
  leave: [["leave"]],
  shortleave: [["shortleave"]],
  custody: [["custody"]],
  warnings: [["warnings"]],
  adjustments: [["adjustments"]],
  reviews: [["review-queue"], ["employees"]],
  payroll: [["payroll"]],
};

/** `?item=done`: the last item was just decided — the panel shows the end state. */
const DONE = "done";

const ORDER: AttentionKey[] = ["leave", "shortleave", "custody", "adjustments", "warnings", "reviews", "payroll"];

function useInboxItems(): { items: InboxItem[]; isLoading: boolean } {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const { data, isLoading } = useAttention();
  const items: InboxItem[] = [];

  for (const r of data.leave ?? []) {
    if (!r.canDecide) continue;
    items.push({
      key: `leave-${r.id}`,
      kind: "leave",
      employee: r.employee,
      title: typeName(r.leaveType),
      detail: t("inbox.leaveDetail", { from: r.startDate, to: r.endDate, count: r.days }),
      submittedAt: r.createdAt,
      approve: { path: `/api/v1/leave/requests/${r.id}/approve`, body: {}, noteField: "note", noteRequired: false },
      reject: { path: `/api/v1/leave/requests/${r.id}/reject`, body: {}, noteField: "note", noteRequired: true },
      link: "/leave?tab=approvals",
      context: <LeaveContext request={r} />,
    });
  }
  for (const r of data.shortleave ?? []) {
    if (!r.canDecide) continue;
    items.push({
      key: `shortleave-${r.id}`,
      kind: "shortleave",
      employee: r.employee,
      title: t(`shortleave.kinds.${r.kind}`),
      detail: t("inbox.shortleaveDetail", { date: r.date, from: r.fromTime, to: r.toTime }),
      submittedAt: r.createdAt,
      approve: { path: `/api/v1/shortleave/requests/${r.id}/approve`, body: {}, noteField: "note", noteRequired: false },
      reject: { path: `/api/v1/shortleave/requests/${r.id}/reject`, body: {}, noteField: "note", noteRequired: false },
      link: "/short-permissions?tab=approvals",
      context: <ShortLeaveContext request={r} />,
    });
  }
  for (const c of data.custody ?? []) {
    const actions = c.actions ?? [];
    if (actions.length === 0) continue;
    const canDecide = actions.includes("approve");
    items.push({
      key: `custody-${c.id}`,
      kind: "custody",
      employee: c.employee,
      title: t("inbox.custodyTitle", { amount: formatHalalas(c.amountHalalas) }),
      detail: c.purpose,
      submittedAt: c.createdAt,
      approve: canDecide ? { path: `/api/v1/custody/requests/${c.id}/approve`, body: {}, noteField: "note", noteRequired: false } : undefined,
      reject: actions.includes("reject") ? { path: `/api/v1/custody/requests/${c.id}/reject`, body: {}, noteField: "note", noteRequired: true } : undefined,
      link: "/custody?tab=manage",
      context: <CustodyContext custody={c} />,
      linkLabel: actions.includes("pay") ? t("inbox.custodyPay") : actions.includes("settle") ? t("inbox.custodySettle") : undefined,
    });
  }
  for (const a of data.adjustments ?? []) {
    if (a.status !== "proposed" || !a.canDecide) continue;
    items.push({
      key: `adjustments-${a.id}`,
      kind: "adjustments",
      employee: a.employee,
      title: t("inbox.adjustmentTitle", { kind: t(`adjustments.kinds.${a.kind}`), amount: formatHalalas(a.amountHalalas) }),
      detail: `${a.period} · ${a.reason}`,
      submittedAt: a.createdAt,
      approve: { path: `/api/v1/adjustments/${a.id}/approve`, body: {}, noteField: "note", noteRequired: false },
      reject: { path: `/api/v1/adjustments/${a.id}/reject`, body: {}, noteField: "note", noteRequired: false },
      link: `/adjustments?period=${a.period}`,
      context: <AdjustmentContext adjustment={a} />,
    });
  }
  for (const w of data.warnings ?? []) {
    if (!w.actions.includes("issue")) continue;
    items.push({
      key: `warnings-${w.id}`,
      kind: "warnings",
      employee: w.employee,
      title: t(`discipline.types.${w.type}`),
      detail: `${w.incidentDate} · ${w.reason}`,
      submittedAt: w.createdAt,
      approve: { path: `/api/v1/warnings/${w.id}/issue`, body: {}, noteField: "note", noteRequired: false },
      // Issuing a warning is serious and the employee is notified: ask first.
      confirmApprove: true,
      reject: w.actions.includes("reject") ? { path: `/api/v1/warnings/${w.id}/reject`, body: {}, noteField: "note", noteRequired: false } : undefined,
      link: "/discipline",
    });
  }
  for (const i of data.reviews?.ibans ?? []) {
    if (i.isOwn) continue;
    items.push({
      key: `iban-${i.employeeId}`,
      kind: "reviews",
      employee: { id: i.employeeId, fullNameAr: i.fullNameAr, fullNameEn: i.fullNameEn },
      title: t("review.kinds.iban"),
      detail: i.pendingIban,
      submittedAt: i.submittedAt,
      approve: { path: `/api/v1/employees/${i.employeeId}/iban/approve`, body: { expectedIban: i.pendingIban }, noteField: "reason", noteRequired: false },
      reject: { path: `/api/v1/employees/${i.employeeId}/iban/reject`, body: { expectedIban: i.pendingIban }, noteField: "reason", noteRequired: true },
      link: "/review-queue",
    });
  }
  for (const d of data.reviews?.documents ?? []) {
    if (d.isOwn) continue;
    items.push({
      key: `doc-${d.id}`,
      kind: "reviews",
      employee: d.employee,
      title: t("review.kinds.document", { type: t(`documents.types.${d.type}`) }),
      detail: d.number,
      submittedAt: d.createdAt,
      // Documents need a look at the file first: reviewed on the review page (with preview).
      link: "/review-queue",
      linkLabel: t("inbox.openToReview"),
    });
  }
  for (const r of data.payroll ?? []) {
    if (!r.canApprove) continue;
    items.push({
      key: `payroll-${r.id}`,
      kind: "payroll",
      employee: null,
      title: t("inbox.payrollTitle", { period: r.period }),
      detail: t("inbox.payrollDetail", { count: r.totals.employees, net: formatHalalas(r.totals.netHalalas) }),
      submittedAt: r.calculatedAt,
      link: `/payroll/${r.id}`,
      linkLabel: t("inbox.openToReview"),
    });
  }
  items.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  return { items, isLoading };
}

/**
 * "الطلبات الواردة": everything waiting on me, in one list, oldest first. Decide on the row, or open a row
 * (or "ابدأ المراجعة") to review it in the side panel with its context; after each decision the panel moves
 * to the next item. The open item is `?item=<key>`, so a reload, "back" or a notification lands on it.
 */
export function InboxPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { items, isLoading } = useInboxItems();
  const panel = usePanelItem();
  const [chosenFilter, setFilter] = useState<AttentionKey | "all">("all");
  const [rejecting, setRejecting] = useState<InboxItem | null>(null);
  const [confirming, setConfirming] = useState<InboxItem | null>(null);
  // Decided items leave the list at once, before the refetch confirms it.
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());

  const waiting = items.filter((i) => !decided.has(i.key));
  const counts = ORDER.map((k) => ({ k, n: waiting.filter((i) => i.kind === k).length })).filter((x) => x.n > 0);
  // A kind whose last item was just decided falls back to "all", so the list never goes blank.
  const filter = chosenFilter !== "all" && counts.some((c) => c.k === chosenFilter) ? chosenFilter : "all";
  const shown = filter === "all" ? waiting : waiting.filter((i) => i.kind === filter);

  // The open item is looked up among everything waiting (a filter change doesn't make it "gone");
  // السابق / التالي walk the filtered list when the item is in it.
  const openKey = panel.id;
  const openItem = openKey ? waiting.find((i) => i.key === openKey) : undefined;
  const queue = openItem && shown.includes(openItem) ? shown : waiting;
  const openIndex = openItem ? queue.indexOf(openItem) : -1;

  const refresh = (kind: AttentionKey): Promise<void[]> =>
    Promise.all(QUERY_KEYS[kind].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const failure = (error: unknown): string => {
    if (error instanceof ApiError && error.code) {
      const known = i18n.exists(`inbox.errors.${error.code}`);
      if (known) return t(`inbox.errors.${error.code}`);
    }
    return t("inbox.failed");
  };

  const decide = useMutation({
    mutationFn: ({ decision, note }: { item: InboxItem; decision: Decision; note: string }) =>
      apiJson(decision.path, { method: "POST", ...jsonBody({ ...decision.body, ...(note ? { [decision.noteField]: note } : {}) }) }),
    onSuccess: (_d, { item, decision }) => {
      const named = { request: item.title, name: item.employee ? nameIn(i18n, item.employee) : "" };
      const verb = decision === item.reject ? "rejectedNamed" : item.kind === "warnings" ? "issuedNamed" : "approvedNamed";
      toast.success(item.employee ? t(`decision.${verb}`, named) : decision === item.reject ? t("inbox.rejected") : t("inbox.approved"));
      setDecided((prev) => new Set(prev).add(item.key));
      setRejecting(null);
      setConfirming(null);
      // Reviewing in the panel: move on to the next item — in the same list, then anything else still
      // waiting — and show the end state only when nothing is left.
      if (openKey === item.key) {
        const rest = queue.filter((i) => i.key !== item.key);
        const others = waiting.filter((i) => i.key !== item.key);
        panel.move((rest[openIndex] ?? rest[0] ?? others[0])?.key ?? DONE);
      }
      // Once the list has reloaded, the server decides: the same record may come back at its next stage
      // (custody to pay, a second approval step), so it must not stay hidden.
      return refresh(item.kind).finally(() =>
        setDecided((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        }),
      );
    },
    onError: (error, { item }) => {
      // Someone else may have decided it meanwhile: reload so it drops out.
      void refresh(item.kind);
      if (!rejecting && !confirming) toast.error(failure(error));
    },
  });

  const approveItem = (item: InboxItem): void => {
    const approve = item.approve;
    if (!approve) return;
    if (item.confirmApprove) setConfirming(item);
    else decide.mutate({ item, decision: approve, note: "" });
  };
  const decisionBar = (item: InboxItem): React.JSX.Element | null => {
    if (!item.approve && !item.reject) return null;
    const busy = decide.isPending && decide.variables?.item.key === item.key;
    return (
      <DecisionBar
        approveLabel={item.kind === "warnings" ? t("inbox.issue") : undefined}
        approving={busy && decide.variables?.decision.path === item.approve?.path}
        onApprove={item.approve ? () => approveItem(item) : undefined}
        onReject={item.reject ? () => setRejecting(item) : undefined}
      />
    );
  };

  const panelOpen = openKey !== null;
  const previous = openIndex > 0 ? queue[openIndex - 1] : undefined;
  const next = openIndex >= 0 ? queue[openIndex + 1] : undefined;

  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        description={t("inbox.description")}
        actions={
          shown.length > 0 && (
            <Button onClick={() => shown[0] && panel.open(shown[0].key)}>
              {t("panel.startReview")}
            </Button>
          )
        }
      />

      {counts.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("inbox.filter")}>
          <Chip active={filter === "all"} onClick={() => setFilter("all")} label={t("common.view.all")} n={waiting.length} />
          {counts.map(({ k, n }) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)} label={t(`inbox.kinds.${k}`)} n={n} />
          ))}
        </div>
      )}

      {isLoading && items.length === 0 && <ListSkeleton rows={4} />}
      {!isLoading && waiting.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("inbox.empty")} />
        </div>
      )}

      {shown.length > 0 && (
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {shown.map((item) => {
            const Icon = ICONS[item.kind];
            const current = item.key === openKey;
            return (
              <li
                key={item.key}
                aria-current={current || undefined}
                className={`flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${current ? "bg-primary-soft" : ""}`}
              >
                {/* The whole summary opens the review panel; the decision buttons stay one tap away. */}
                <button
                  type="button"
                  onClick={() => (openKey ? panel.move(item.key) : panel.open(item.key))}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-control text-start hover:opacity-90"
                >
                  {item.employee ? (
                    <Avatar name={item.employee.fullNameAr} size="sm" />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 text-dense">
                      {item.employee && <span className="font-semibold">{nameIn(i18n, item.employee)}</span>}
                      <span className="inline-flex items-center gap-1 text-ink-muted">
                        <Icon className="size-3.5" aria-hidden />
                        {item.title}
                      </span>
                    </span>
                    <span className="block truncate text-meta text-ink-muted">
                      <bdi>{item.detail}</bdi>
                    </span>
                    <span className="block text-meta text-ink-muted">{t("inbox.submitted", { date: item.submittedAt.slice(0, 10) })}</span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {decisionBar(item)}
                  {item.linkLabel && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={item.link}>
                        {item.linkLabel}
                        <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {decide.isError && !rejecting && !confirming && <Alert className="mt-3">{failure(decide.error)}</Alert>}

      <ReviewPanel
        open={panelOpen}
        title={
          openItem
            ? openItem.employee
              ? `${nameIn(i18n, openItem.employee)} · ${openItem.title}`
              : openItem.title
            : openKey === DONE
              ? t("panel.doneTitle")
              : isLoading
                ? t("common.loading")
                : t("panel.goneTitle")
        }
        subtitle={openItem ? t(`inbox.kinds.${openItem.kind}`) : undefined}
        position={openItem ? openIndex + 1 : undefined}
        total={queue.length}
        onPrevious={previous ? () => panel.move(previous.key) : undefined}
        onNext={next ? () => panel.move(next.key) : undefined}
        onClose={panel.close}
        footer={
          openItem && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={openItem.link} className="text-dense text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                {openItem.linkLabel ?? t("panel.openInModule", { module: t(`panel.modules.${openItem.kind}`) })}
              </Link>
              {decisionBar(openItem)}
            </div>
          )
        }
      >
        {openItem ? (
          (openItem.context ?? <BasicContext title={openItem.title} detail={openItem.detail} submittedAt={openItem.submittedAt} />)
        ) : isLoading && openKey !== DONE ? (
          <ListSkeleton rows={3} />
        ) : (
          <EmptyState
            message={openKey === DONE ? t("panel.done") : t("panel.gone")}
            action={
              <Button asChild variant="secondary">
                <Link to="/">{t("panel.backToDashboard")}</Link>
              </Button>
            }
          />
        )}
      </ReviewPanel>

      {rejecting?.reject && (
        <DecisionDialog
          title={t("inbox.rejectTitle", { request: rejecting.title, name: rejecting.employee ? nameIn(i18n, rejecting.employee) : "" })}
          description={t("inbox.rejectBody")}
          confirmLabel={t("inbox.reject")}
          danger
          noteRequired={rejecting.reject.noteRequired}
          noteLabel={t("inbox.reason")}
          pending={decide.isPending}
          error={decide.isError ? failure(decide.error) : null}
          onConfirm={(note) => {
            const reject = rejecting.reject;
            if (reject) decide.mutate({ item: rejecting, decision: reject, note });
          }}
          onClose={() => {
            setRejecting(null);
            decide.reset();
          }}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? t("inbox.issueTitle", { request: confirming.title, name: confirming.employee ? nameIn(i18n, confirming.employee) : "" }) : ""}
        description={t("inbox.issueBody")}
        confirmLabel={t("inbox.issue")}
        pending={decide.isPending}
        error={decide.isError ? failure(decide.error) : null}
        onConfirm={() => {
          const approve = confirming?.approve;
          if (confirming && approve) decide.mutate({ item: confirming, decision: approve, note: "" });
        }}
        onClose={() => {
          setConfirming(null);
          decide.reset();
        }}
      />
    </div>
  );
}

function Chip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-dense ${
        active ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink hover:bg-canvas"
      }`}
    >
      {label}
      <span className="tabular-nums text-meta text-ink-muted">{n}</span>
    </button>
  );
}
