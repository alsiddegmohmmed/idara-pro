import { PERMISSIONS, SHORTLEAVE_KINDS, type ShortLeaveAllowance, type ShortLeaveKind, type ShortLeaveView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ArrowRight, LogOut, Plus, TimerReset, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DecisionBar } from "@/components/decision-bar";
import { DecisionDialog } from "@/components/decision-dialog";
import { ListViewTabs, useListView } from "@/components/list-view-tabs";
import { ReviewPanel, usePanelItem } from "@/components/review-panel";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker, MonthPicker } from "@/components/ui/date-picker";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ListSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { ShortLeaveContext } from "@/features/inbox/review-contexts";
import { apiJson, jsonBody } from "@/lib/api";
import { formatDuration, ltr, todayInRiyadh } from "@/lib/dates";
import { useFormCheck } from "@/lib/use-form-check";
import { useOpenOnNewParam } from "@/lib/use-new-param";
import { cn } from "@/lib/utils";
import { AllowanceBar, toHHMM, toMinutes, useEmployeeAllowance, useShortLeaveError, Window } from "../shared";

// ux-redesign-v2 §6: الاستئذانات rebuilt. Employees see their allowance and ask in two steps with times
// taken from their shift; approvers see the day's requests with the allowance left after approval.

const STATUS_TONE: Record<ShortLeaveView["status"], Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
const KIND_ICON: Record<ShortLeaveKind, LucideIcon> = { late_arrival: AlarmClock, early_leave: LogOut, mid_day: TimerReset };
const DURATIONS = [30, 60, 90, 120];

function StatusBadge({ status }: { status: ShortLeaveView["status"] }): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`shortleave.statuses.${status}`)}</Badge>;
}

function KindLabel({ kind }: { kind: ShortLeaveKind }): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
      {t(`shortleave.kinds.${kind}`)}
    </span>
  );
}

/** "اليوم" / "غداً" / "أمس" or the date itself. */
function useDayLabel(): (date: string) => string {
  const { t } = useTranslation();
  const today = todayInRiyadh();
  const shift = (n: number): string => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return (date) => (date === today ? t("shortleave.day.today") : date === shift(1) ? t("shortleave.day.tomorrow") : date === shift(-1) ? t("shortleave.day.yesterday") : date);
}

// ---------------- mine ----------------

/** Times for a kind and a duration, from the shift: late arrival starts at shift start, early leave ends at shift end. */
function suggestTimes(kind: ShortLeaveKind, minutes: number, schedule: ShortLeaveAllowance["schedule"], from: string): { fromTime: string; toTime: string } {
  if (kind === "late_arrival" && schedule) return { fromTime: schedule.startTime, toTime: toHHMM(toMinutes(schedule.startTime) + minutes) };
  if (kind === "early_leave" && schedule) return { fromTime: toHHMM(toMinutes(schedule.endTime) - minutes), toTime: schedule.endTime };
  const start = from || (schedule ? toHHMM(toMinutes(schedule.startTime) + 120) : "10:00");
  return { fromTime: start, toTime: toHHMM(toMinutes(start) + minutes) };
}

function RequestDialog({ open, onClose, allowance }: { open: boolean; onClose: () => void; allowance: ShortLeaveAllowance | undefined }): React.JSX.Element {
  const { t } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const blank = { date: todayInRiyadh(), kind: "" as ShortLeaveKind | "", fromTime: "", toTime: "", reason: "" };
  const [form, setForm] = useState(blank);
  const check = useFormCheck();
  const schedule = allowance?.schedule ?? null;
  const minutes = form.fromTime && form.toTime ? toMinutes(form.toTime) - toMinutes(form.fromTime) : 0;
  const timesOk = minutes > 0;
  const valid = form.kind !== "" && form.date !== "" && timesOk && form.reason.trim().length >= 3;
  const remainingAfter = allowance ? allowance.remainingMinutes - Math.max(minutes, 0) : null;

  const submit = useMutation({
    mutationFn: () => apiJson("/api/v1/shortleave/requests", { method: "POST", ...jsonBody({ ...form, reason: form.reason.trim() }) }),
    onSuccess: () => {
      toast.success(t("shortleave.request.sent"));
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
      close();
    },
  });
  function close(): void {
    submit.reset();
    setForm(blank);
    check.reset();
    onClose();
  }
  const pickKind = (kind: ShortLeaveKind): void => setForm((f) => ({ ...f, kind, ...suggestTimes(kind, 60, schedule, "") }));
  const pickDuration = (m: number): void =>
    setForm((f) => (f.kind === "" ? f : { ...f, ...suggestTimes(f.kind, m, schedule, f.kind === "mid_day" ? f.fromTime : "") }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("shortleave.request.title")}</DialogTitle>
          <DialogDescription>{form.kind === "" ? t("shortleave.request.pickKind") : t("shortleave.request.hint")}</DialogDescription>
        </DialogHeader>

        {form.kind === "" ? (
          <div className="grid gap-3" role="group" aria-label={t("shortleave.kind")}>
            {SHORTLEAVE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickKind(k)}
                  className="flex items-center gap-4 rounded-panel border border-line p-4 text-start transition-colors hover:border-primary hover:bg-primary-soft"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-ink">{t(`shortleave.kinds.${k}`)}</span>
                    <span className="block text-meta text-ink-muted">{t(`shortleave.kindHints.${k}`)}</span>
                  </span>
                  <ArrowRight className="size-4 text-ink-muted rtl:rotate-180" aria-hidden />
                </button>
              );
            })}
          </div>
        ) : (
          <form
            onBlur={check.onBlur}
            id="shortleave-form"
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (check.submit(valid)) submit.mutate();
            }}
          >
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <KindLabel kind={form.kind} />
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, kind: "", fromTime: "", toTime: "" }))}>
                {t("shortleave.request.changeKind")}
              </Button>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("shortleave.date")} htmlFor="sl-date" required hint={t("shortleave.request.dateHint")}>
                <DatePicker id="sl-date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label={t("shortleave.request.duration")}>
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutes === m}
                  onClick={() => pickDuration(m)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-dense",
                    minutes === m ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink hover:bg-canvas",
                  )}
                >
                  {t(`shortleave.durations.${m}`)}
                </button>
              ))}
            </div>
            <Field label={t("shortleave.from")} htmlFor="sl-from" required error={check.show("sl-from") && !form.fromTime ? t("employees.form.required") : undefined}>
              <Input id="sl-from" type="time" dir="ltr" value={form.fromTime} onChange={(e) => setForm((f) => ({ ...f, fromTime: e.target.value }))} />
            </Field>
            <Field
              label={t("shortleave.to")}
              htmlFor="sl-to"
              required
              error={check.show("sl-to") && !form.toTime ? t("employees.form.required") : form.fromTime && form.toTime && !timesOk ? t("shortleave.errors.to_after_from") : undefined}
            >
              <Input id="sl-to" type="time" dir="ltr" min={form.fromTime || undefined} value={form.toTime} onChange={(e) => setForm((f) => ({ ...f, toTime: e.target.value }))} />
            </Field>
            {timesOk && remainingAfter !== null && (
              <p className={cn("text-dense sm:col-span-2", remainingAfter < 0 ? "text-danger" : "text-ink-muted")}>
                {remainingAfter < 0
                  ? t("shortleave.request.overAllowance")
                  : t("shortleave.request.remainingAfter", { time: formatDuration(remainingAfter) })}
              </p>
            )}
            <div className="sm:col-span-2">
              <Field label={t("shortleave.reason")} htmlFor="sl-reason" required error={check.show("sl-reason") && form.reason.trim().length < 3 ? t("employees.form.required") : undefined}>
                <Textarea id="sl-reason" rows={3} maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              </Field>
            </div>
            {submit.isError && <Alert className="sm:col-span-2">{errorText(submit.error)}</Alert>}
          </form>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          {form.kind !== "" && (
            <Button type="submit" form="shortleave-form" loading={submit.isPending}>
              {t("shortleave.request.submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MyShortLeave({ active = true }: { active?: boolean }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const allowance = useQuery({ queryKey: ["shortleave", "allowance"], queryFn: () => apiJson<ShortLeaveAllowance>("/api/v1/shortleave/me/allowance") });
  const list = useQuery({ queryKey: ["shortleave", "mine"], queryFn: () => apiJson<ShortLeaveView[]>("/api/v1/shortleave/me/requests") });
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<ShortLeaveView | null>(null);
  // ?new=1 opens the request form — only when this view is the one on screen.
  useOpenOnNewParam(() => active && setOpen(true));
  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/shortleave/requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("shortleave.cancelled"));
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
    },
  });
  const monthName = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const byMonth = useMemo(() => {
    const groups = new Map<string, ShortLeaveView[]>();
    for (const r of [...(list.data ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
      const key = r.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()];
  }, [list.data]);

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-60 flex-1">{allowance.data ? <AllowanceBar a={allowance.data} /> : <Skeleton className="h-10" />}</div>
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t("shortleave.request.title")}
          </Button>
        </div>
      </Panel>

      {list.isLoading ? (
        <ListSkeleton rows={3} rowClassName="h-16" />
      ) : list.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : byMonth.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("shortleave.emptyMine")} />
        </div>
      ) : (
        byMonth.map(([month, rows]) => (
          <section key={month}>
            <h2 className="mb-2 text-subsection text-ink">{monthName.format(new Date(`${month}-01T00:00:00Z`))}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-panel border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <KindLabel kind={r.kind} />
                      </p>
                      <p className="mt-1 text-dense text-ink-muted">
                        <bdi className="tabular-nums">{r.date}</bdi> · <Window r={r} />
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.decisionNote && <p className="mt-2 text-meta text-ink-muted">{r.decisionNote}</p>}
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 -ms-2"
                      onClick={() => {
                        cancel.reset();
                        setCancelling(r);
                      }}
                    >
                      {t("shortleave.cancel")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <RequestDialog open={open} onClose={() => setOpen(false)} allowance={allowance.data} />
      <ConfirmDialog
        open={cancelling !== null}
        title={t("shortleave.cancelTitle", { date: ltr(cancelling?.date ?? "") })}
        confirmLabel={t("shortleave.cancel")}
        danger
        pending={cancel.isPending}
        error={cancel.isError ? errorText(cancel.error) : null}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        onClose={() => setCancelling(null)}
      />
    </div>
  );
}

// ---------------- approvals ----------------

/** "يتبقى X بعد الموافقة" for one row (approval moves pending minutes to used, so it's today's remaining). */
function RemainingAfter({ r }: { r: ShortLeaveView }): React.JSX.Element | null {
  const { t } = useTranslation();
  const allowance = useEmployeeAllowance(r.employee?.id, r.date.slice(0, 7));
  if (!allowance.data) return null;
  return (
    <span className="text-meta text-ink-muted">
      {t("shortleave.remainingAfter", { time: formatDuration(allowance.data.remainingMinutes), total: formatDuration(allowance.data.allowanceMinutes) })}
    </span>
  );
}

function Approvals(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const dayLabel = useDayLabel();
  const panel = usePanelItem();
  const [view, setView] = useListView();
  const [month, setMonth] = useState(() => todayInRiyadh().slice(0, 7));
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");
  const pending = useQuery({
    queryKey: ["shortleave", "list", "pending"],
    queryFn: () => apiJson<ShortLeaveView[]>("/api/v1/shortleave/requests?status=pending"),
  });
  const all = useQuery({
    queryKey: ["shortleave", "list", "all", status],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests${status ? `?status=${status}` : ""}`),
    enabled: view === "all",
  });
  const [deciding, setDeciding] = useState<{ r: ShortLeaveView; action: "approve" | "reject" } | null>(null);

  // Pending: decidable ones first, grouped by day, soonest day first.
  const queue = useMemo(() => [...(pending.data ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.fromTime.localeCompare(b.fromTime)), [pending.data]);
  const decidable = queue.filter((r) => r.canDecide);
  const groups = useMemo(() => {
    const m = new Map<string, ShortLeaveView[]>();
    for (const r of queue) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [queue]);
  const openIndex = panel.id ? decidable.findIndex((r) => r.id === panel.id) : -1;
  const openRequest = openIndex >= 0 ? decidable[openIndex] : undefined;
  const openRow = (id: string): void => (panel.id ? panel.move(id) : panel.open(id));

  const decide = useMutation({
    mutationFn: ({ r, action, note }: { r: ShortLeaveView; action: "approve" | "reject"; note: string }) =>
      apiJson(`/api/v1/shortleave/requests/${r.id}/${action}`, { method: "POST", ...jsonBody(note ? { note } : {}) }),
    onSuccess: (_d, { r, action }) => {
      const named = { request: t(`shortleave.kinds.${r.kind}`), name: r.employee ? nameIn(i18n, r.employee) : "" };
      toast.success(r.employee ? t(action === "approve" ? "decision.approvedNamed" : "decision.rejectedNamed", named) : t("common.changesSaved"));
      setDeciding(null);
      // Reviewing in the panel: on to the next request, or close after the last.
      if (panel.id === r.id) {
        const rest = decidable.filter((x) => x.id !== r.id);
        const next = rest[openIndex] ?? rest[0];
        if (next) panel.move(next.id);
        else panel.close();
      }
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
    },
  });
  const bar = (r: ShortLeaveView): React.JSX.Element => (
    <DecisionBar onApprove={() => setDeciding({ r, action: "approve" })} onReject={() => setDeciding({ r, action: "reject" })} />
  );

  const term = person.trim().toLowerCase();
  const allRows = (all.data ?? []).filter(
    (r) =>
      r.date.startsWith(month) &&
      (!term || (r.employee && `${r.employee.fullNameAr} ${r.employee.fullNameEn} ${r.employee.employeeNo}`.toLowerCase().includes(term))),
  );

  return (
    <div className="space-y-4">
      <ListViewTabs
        value={view}
        onChange={setView}
        pendingCount={decidable.length}
        filters={
          view === "all" && (
            <>
              <MonthPicker value={month} onChange={setMonth} />
              <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder={t("shortleave.searchEmployee")} aria-label={t("shortleave.searchEmployee")} className="w-56" />
              <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("shortleave.status")} className="w-auto min-w-40">
                <option value="">{t("shortleave.allStatuses")}</option>
                {(["pending", "approved", "rejected", "cancelled"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`shortleave.statuses.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </>
          )
        }
      />

      {view === "pending" ? (
        pending.isLoading ? (
          <ListSkeleton rows={3} rowClassName="h-20" />
        ) : pending.isError ? (
          <Alert>{t("common.loadFailed")}</Alert>
        ) : groups.length === 0 ? (
          <div className="rounded-panel border border-line bg-surface">
            <EmptyState message={t("shortleave.emptyApprovals")} />
          </div>
        ) : (
          groups.map(([date, rows]) => (
            <section key={date}>
              <h2 className="mb-2 text-dense font-semibold text-ink-muted">
                <bdi className="tabular-nums">{dayLabel(date)}</bdi>
              </h2>
              <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    aria-current={r.id === panel.id || undefined}
                    className={cn("flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4", r.id === panel.id && "bg-primary-soft")}
                  >
                    <button
                      type="button"
                      disabled={!r.canDecide}
                      onClick={() => openRow(r.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-control text-start disabled:cursor-default"
                    >
                      {r.employee && <Avatar name={r.employee.fullNameAr} size="sm" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-dense">
                          {r.employee && <span className="font-semibold text-ink">{nameIn(i18n, r.employee)}</span>}
                          <KindLabel kind={r.kind} />
                          <span className="text-ink-muted">
                            <Window r={r} />
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-meta text-ink-muted" title={r.reason}>
                          {r.reason}
                        </span>
                        <RemainingAfter r={r} />
                      </span>
                    </button>
                    <div className="flex shrink-0 justify-end">
                      {r.canDecide ? bar(r) : <span className="text-meta text-ink-muted">{t("common.waitingOther")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )
      ) : all.isLoading ? (
        <TableSkeleton columns={5} />
      ) : all.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : allRows.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("shortleave.emptyApprovals")} />
        </div>
      ) : (
        <Table busy={all.isPlaceholderData}>
          <TableHeader>
            <tr>
              <TableHead>{t("shortleave.employee")}</TableHead>
              <TableHead className="w-28">{t("shortleave.day.label")}</TableHead>
              <TableHead>{t("shortleave.kindAndTime")}</TableHead>
              <TableHead>{t("shortleave.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("shortleave.decisionNote")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {[...allRows]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap font-medium">{r.employee && nameIn(i18n, r.employee)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <bdi>{r.date}</bdi>
                  </TableCell>
                  <TableCell>
                    <span className="block">
                      <KindLabel kind={r.kind} />
                    </span>
                    <span className="text-meta text-ink-muted">
                      <Window r={r} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-xs lg:table-cell">
                    <p className="line-clamp-2 text-meta text-ink-muted">{r.decisionNote ?? "—"}</p>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <ReviewPanel
        open={panel.id !== null}
        title={openRequest?.employee ? `${nameIn(i18n, openRequest.employee)} · ${t(`shortleave.kinds.${openRequest.kind}`)}` : t("panel.goneTitle")}
        position={openRequest ? openIndex + 1 : undefined}
        total={decidable.length}
        onPrevious={openIndex > 0 ? () => panel.move(decidable[openIndex - 1]?.id ?? null) : undefined}
        onNext={openIndex >= 0 && openIndex < decidable.length - 1 ? () => panel.move(decidable[openIndex + 1]?.id ?? null) : undefined}
        onClose={panel.close}
        footer={openRequest && <div className="flex justify-end">{bar(openRequest)}</div>}
      >
        {openRequest ? <ShortLeaveContext request={openRequest} /> : pending.isLoading ? <ListSkeleton rows={2} /> : <EmptyState message={t("panel.gone")} />}
      </ReviewPanel>

      {deciding && (
        <DecisionDialog
          title={t(`shortleave.confirm.${deciding.action}`)}
          description={deciding.action === "approve" && deciding.r.kind === "late_arrival" ? t("shortleave.confirm.approveHint") : undefined}
          confirmLabel={t(`decision.${deciding.action}`)}
          danger={deciding.action === "reject"}
          pending={decide.isPending}
          error={decide.isError ? errorText(decide.error) : null}
          onConfirm={(note) => decide.mutate({ r: deciding.r, action: deciding.action, note })}
          onClose={() => {
            decide.reset();
            setDeciding(null);
          }}
        />
      )}
    </div>
  );
}

/** الاستئذانات: hours off within a working day, against a monthly allowance. */
export function ShortPermissionsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { hasEmployee } = useMyEmployee();
  const [params, setParams] = useSearchParams();
  const showMine = hasEmployee && can(PERMISSIONS.SHORTLEAVE_REQUEST);
  const showApprovals = can(PERMISSIONS.SHORTLEAVE_READ);
  const tabs = [...(showMine ? ["mine"] : []), ...(showApprovals ? ["approvals"] : [])];
  const tab = tabs.find((x) => x === params.get("tab")) ?? tabs[0] ?? "mine";
  return (
    <div>
      <PageHeader title={t("shortleave.title")} description={t("shortleave.description")} />
      {tabs.length > 1 ? (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            next.delete("item");
            setParams(next, { replace: true, preventScrollReset: true });
          }}
        >
          <TabsList>
            {tabs.map((x) => (
              <TabsTrigger key={x} value={x}>
                {t(`shortleave.tabs.${x}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="mine">
            <MyShortLeave active={tab === "mine"} />
          </TabsContent>
          <TabsContent value="approvals">
            <Approvals />
          </TabsContent>
        </Tabs>
      ) : tab === "approvals" ? (
        <Approvals />
      ) : (
        <MyShortLeave />
      )}
    </div>
  );
}
