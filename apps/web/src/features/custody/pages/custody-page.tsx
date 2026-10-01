import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ListViewTabs, useListView } from "@/components/list-view-tabs";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { downloadFile } from "@/features/employees/documents";
import { nameIn } from "@/features/employees/employee-name";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatDateTime, todayInRiyadh } from "@/lib/dates";
import { formatHalalas, sarToHalalas } from "@/lib/money";
import { useOpenOnNewParam } from "@/lib/use-new-param";
import { DatePicker } from "@/components/ui/date-picker";
import { useFormCheck } from "@/lib/use-form-check";

type Status = "requested" | "approved" | "rejected" | "cancelled" | "paid" | "settled";
type Action = "approve" | "reject" | "pay" | "settle";

interface Custody {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  amountHalalas: string;
  purpose: string;
  status: Status;
  decisionNote: string | null;
  decidedAt?: string | null;
  paidAt: string | null;
  technoLinkRef: string | null;
  settledAt?: string | null;
  settledAmountHalalas: string | null;
  settlementNote?: string | null;
  createdAt: string;
  actions?: Action[];
}

const TONES: Record<Status, Tone> = {
  requested: "warning",
  approved: "info",
  rejected: "danger",
  cancelled: "neutral",
  paid: "success",
  settled: "neutral",
};

function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge tone={TONES[status]}>{t(`custody.status.${status}`)}</Badge>;
}

function Amount({ halalas }: { halalas: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="whitespace-nowrap tabular-nums">
      <bdi>{formatHalalas(halalas)}</bdi> {t("employees.salary.sar")}
    </span>
  );
}

/** Everything about one custody request, step by step — opened from any row. */
function CustodyDetail({ custody, onClose, onAction }: { custody: Custody | null; onClose: () => void; onAction?: (c: Custody, a: Action) => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const c = custody;
  const step = (done: boolean, label: string, when: string | null | undefined, extra?: React.ReactNode) => (
    <li className="flex gap-3">
      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${done ? "bg-primary" : "bg-line"}`} aria-hidden />
      <span className="min-w-0">
        <span className={done ? "font-medium" : "text-ink-muted"}>{label}</span>
        {when && (
          <span className="ms-2 text-meta text-ink-muted">
            <bdi>{formatDateTime(when)}</bdi>
          </span>
        )}
        {extra && <span className="block text-meta text-ink-muted">{extra}</span>}
      </span>
    </li>
  );
  return (
    <Dialog open={c !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {c && (
          <>
            <DialogHeader>
              <DialogTitle>{c.purpose}</DialogTitle>
              <DialogDescription>
                {c.employee ? `${nameIn(i18n, c.employee)} · ` : ""}
                <Amount halalas={c.amountHalalas} />
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <StatusBadge status={c.status} />
            </div>
            <ol className="space-y-3 text-dense">
              {step(true, t("custody.timeline.requested"), c.createdAt)}
              {c.status === "rejected"
                ? step(true, t("custody.status.rejected"), c.decidedAt, c.decisionNote ? t("notifications.reason", { reason: c.decisionNote }) : undefined)
                : c.status === "cancelled"
                  ? step(true, t("custody.status.cancelled"), c.decidedAt)
                  : (
                    <>
                      {step(["approved", "paid", "settled"].includes(c.status), t("custody.timeline.approved"), c.decidedAt, c.decisionNote ?? undefined)}
                      {step(
                        ["paid", "settled"].includes(c.status),
                        t("custody.timeline.paid"),
                        c.paidAt,
                        c.technoLinkRef ? `${t("custody.technoLinkRef")}: ${c.technoLinkRef}` : undefined,
                      )}
                      {step(
                        c.status === "settled",
                        t("custody.timeline.settled"),
                        c.settledAt,
                        c.settledAmountHalalas ? (
                          <>
                            {t("custody.settledAmount")}: <Amount halalas={c.settledAmountHalalas} />
                            {c.settlementNote ? ` · ${c.settlementNote}` : ""}
                          </>
                        ) : undefined,
                      )}
                    </>
                  )}
            </ol>
            {onAction && (c.actions ?? []).length > 0 && (
              <DialogFooter>
                {(c.actions ?? []).map((a) => (
                  <Button key={a} variant={a === "reject" ? "secondary" : "primary"} className={a === "reject" ? "text-danger" : undefined} onClick={() => onAction(c, a)}>
                    {t(`custody.actions.${a}`)}
                  </Button>
                ))}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useCustodyError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    const code = e instanceof ApiError ? e.code : "";
    const key = ["own_request", "out_of_scope", "invalid_transition", "settlement_exceeds_paid", "employee_inactive"].find(
      (k) => code === `custody.${k}`,
    );
    return key ? t(`custody.errors.${key}`) : t("custody.errors.failed");
  };
}

export function MyCustodyTab(): React.JSX.Element {
  const { t } = useTranslation();
  const errorText = useCustodyError();
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: ["custody", "mine"], queryFn: () => apiJson<Custody[]>("/api/v1/custody/me/requests") });
  const [detail, setDetail] = useState<Custody | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  useOpenOnNewParam(() => setOpen(true));
  const [purpose, setPurpose] = useState("");
  const check = useFormCheck();
  const halalas = sarToHalalas(amount);
  const valid = Boolean(halalas && halalas !== "0") && purpose.trim().length >= 3;

  const create = useMutation({
    mutationFn: () => apiJson("/api/v1/custody/requests", { method: "POST", ...jsonBody({ amountHalalas: halalas, purpose: purpose.trim() }) }),
    onSuccess: () => {
      toast.success(t("custody.request.sent"));
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["custody"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/custody/requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("custody.request.cancelled"));
      void queryClient.invalidateQueries({ queryKey: ["custody"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          icon={<Plus />}
          className="w-full sm:w-auto"
          onClick={() => {
            setAmount("");
            setPurpose("");
            check.reset();
            create.reset();
            setOpen(true);
          }}
        >
          {t("custody.request.title")}
        </Button>
      </div>
      {mine.isLoading && <Skeleton className="h-40" />}
      {mine.data && mine.data.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("custody.noRequests")} />
        </div>
      )}
      {mine.data && mine.data.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("custody.purpose")}</TableHead>
              <TableHead>{t("custody.amount")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {mine.data.map((c) => (
              <TableRow key={c.id} onClick={() => setDetail(c)}>
                <TableCell>
                  <p className="font-medium">{c.purpose}</p>
                  <p className="text-meta text-ink-muted">
                    <bdi>{c.createdAt.slice(0, 10)}</bdi>
                  </p>
                </TableCell>
                <TableCell>
                  <Amount halalas={c.amountHalalas} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={c.status} />
                    {c.status === "rejected" && c.decisionNote && (
                      <span className="text-meta text-danger">{t("notifications.reason", { reason: c.decisionNote })}</span>
                    )}
                    {c.status === "settled" && c.settledAmountHalalas && (
                      <span className="text-meta text-ink-muted">
                        {t("custody.settledAmount")}: <Amount halalas={c.settledAmountHalalas} />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {c.status === "requested" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={cancel.isPending && cancel.variables === c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        cancel.mutate(c.id);
                      }}
                    >
                      {t("leave.request.cancel")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CustodyDetail custody={detail} onClose={() => setDetail(null)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onBlur={check.onBlur}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!check.submit(valid)) return;
              create.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("custody.request.title")}</DialogTitle>
              <DialogDescription>{t("custody.request.description")}</DialogDescription>
            </DialogHeader>
            <Field label={t("custody.amountSar")} htmlFor="c-amount" error={check.show("c-amount") && !halalas ? t("employees.salary.badAmount") : undefined}>
              <Input id="c-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t("custody.purpose")} htmlFor="c-purpose" error={check.show("c-purpose") && purpose.trim().length < 3 ? t("custody.purposeRequired") : undefined}>
              <Textarea id="c-purpose" rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            {create.isError && <Alert>{errorText(create.error)}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" loading={create.isPending}>
                {t("custody.request.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionDialog({ target, onClose }: { target: { custody: Custody; action: Action } | null; onClose: () => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const errorText = useCustodyError();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const action = target?.action;

  const body = (): Record<string, string> => {
    if (action === "reject") return { note: text.trim() };
    if (action === "pay") return { technoLinkRef: text.trim() };
    if (action === "settle") return { settledAmountHalalas: sarToHalalas(amount) ?? "", ...(text.trim() ? { note: text.trim() } : {}) };
    return text.trim() ? { note: text.trim() } : {};
  };
  const valid =
    action === "reject" ? text.trim().length >= 3 : action === "pay" ? text.trim().length >= 1 : action === "settle" ? sarToHalalas(amount) !== null : true;

  const run = useMutation({
    mutationFn: () => apiJson(`/api/v1/custody/requests/${target?.custody.id}/${action}`, { method: "POST", ...jsonBody(body()) }),
    onSuccess: () => {
      toast.success(t(`custody.done.${action}`));
      void queryClient.invalidateQueries({ queryKey: ["custody"] });
      onClose();
    },
  });

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setText("");
          setAmount("");
          run.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) run.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {target && t(`custody.actions.${target.action}Title`, { name: target.custody.employee ? nameIn(i18n, target.custody.employee) : "" })}
            </DialogTitle>
            <DialogDescription>
              {target && (
                <>
                  {target.custody.purpose} · <Amount halalas={target.custody.amountHalalas} />
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {action === "settle" && (
            <Field label={t("custody.settledAmountSar")} htmlFor="ca-amount" hint={t("custody.settleHint")}>
              <Input id="ca-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          <Field
            label={action === "pay" ? t("custody.technoLinkRef") : action === "reject" ? t("review.reason") : t("custody.note")}
            htmlFor="ca-text"
            hint={action === "pay" ? t("custody.technoLinkHint") : undefined}
          >
            {action === "pay" ? (
              <Input id="ca-text" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
            ) : (
              <Textarea id="ca-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            )}
          </Field>
          {run.isError && <Alert>{errorText(run.error)}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant={action === "reject" ? "danger" : "primary"} loading={run.isPending} disabled={!valid}>
              {action && t(`custody.actions.${action}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [view, setView] = useListView();
  const [status, setStatus] = useState<"" | Status>("");
  const all = useQuery({
    queryKey: ["custody", "list", view === "all" ? status : ""],
    queryFn: () => apiJson<Custody[]>(`/api/v1/custody/requests${view === "all" && status ? `?status=${status}` : ""}`),
  });
  // "Waiting": every request still moving (to approve, to pay, to settle) — one list, oldest first.
  const waiting = (all.data ?? []).filter((c) => c.status === "requested" || c.status === "approved" || c.status === "paid");
  const list = { ...all, data: all.data ? (view === "pending" ? [...waiting].reverse() : all.data) : undefined };
  const [target, setTarget] = useState<{ custody: Custody; action: Action } | null>(null);
  const [detail, setDetail] = useState<Custody | null>(null);
  const [exporting, setExporting] = useState(false);

  return (
    <div className="space-y-4">
      <ListViewTabs
        value={view}
        onChange={setView}
        pendingCount={view === "pending" ? waiting.length : undefined}
        filters={
          view === "all" ? (
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} aria-label={t("employees.fields.status")} className="w-auto min-w-44">
              <option value="">{t("employees.filters.allStatuses")}</option>
              {(["requested", "approved", "paid", "settled", "rejected", "cancelled"] as Status[]).map((s) => (
                <option key={s} value={s}>
                  {t(`custody.status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        {can(PERMISSIONS.EXPORTS_CREATE) && (
          // The export has its own date range (paid between …), so it lives in a dialog, not next to the list filters.
          <Button variant="secondary" icon={<Download />} className="ms-auto" onClick={() => setExporting(true)}>
            {t("custody.export")}
          </Button>
        )}
      </div>
      {list.isLoading && <Skeleton className="h-40" />}
      {list.data && list.data.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("custody.noRequestsAll")} />
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("custody.purpose")}</TableHead>
              <TableHead>{t("custody.amount")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {list.data.map((c) => (
              <TableRow key={c.id} onClick={() => setDetail(c)}>
                <TableCell>
                  {c.employee && (
                    <span className="flex items-center gap-3">
                      <Avatar name={c.employee.fullNameAr} size="sm" />
                      <span className="font-medium">{nameIn(i18n, c.employee)}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-72">
                  <p className="truncate">{c.purpose}</p>
                  {c.technoLinkRef && (
                    <p className="text-meta text-ink-muted">
                      {t("custody.technoLinkRef")}: <bdi>{c.technoLinkRef}</bdi>
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Amount halalas={c.amountHalalas} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {(c.actions ?? []).length === 0 && (c.status === "requested" || c.status === "approved" || c.status === "paid") && (
                      // No button for this user: say whose step it is, so the row doesn't look stuck.
                      <span className="text-meta text-ink-muted">{t(`custody.waiting.${c.status}`)}</span>
                    )}
                    {(c.actions ?? []).map((a) => (
                      <Button
                        key={a}
                        variant="secondary"
                        size="sm"
                        className={a === "reject" ? "text-danger" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTarget({ custody: c, action: a });
                        }}
                      >
                        {t(`custody.actions.${a}`)}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ActionDialog target={target} onClose={() => setTarget(null)} />
      <CustodyDetail
        custody={detail}
        onClose={() => setDetail(null)}
        onAction={(c, a) => {
          setDetail(null);
          setTarget({ custody: c, action: a });
        }}
      />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

/** Excel of custody paid in a date range, for the accountant to enter in Techno Link. */
function ExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => `${todayInRiyadh().slice(0, 7)}-01`);
  const [to, setTo] = useState(() => todayInRiyadh());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const valid = Boolean(from && to && from <= to);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("custody.export")}</DialogTitle>
          <DialogDescription>{t("custody.exportHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("custody.paidFrom")} htmlFor="cx-from" required>
            <DatePicker id="cx-from" value={from} onChange={(v) => setFrom(v)} />
          </Field>
          <Field label={t("custody.paidTo")} htmlFor="cx-to" required error={from && to && from > to ? t("custody.rangeInvalid") : undefined}>
            <DatePicker id="cx-to" value={to} min={from} onChange={(v) => setTo(v)} />
          </Field>
        </div>
        {error && <Alert>{t("common.loadFailed")}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button
            icon={<Download />}
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              setError(false);
              const ok = await downloadFile(`/api/v1/custody/export.xlsx?from=${from}&to=${to}`, `custody-${from}-${to}.xlsx`);
              setBusy(false);
              if (!ok) return setError(true);
              toast.success(t("custody.exported"));
              onClose();
            }}
          >
            {t("custody.downloadExcel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** العهد: my requests (employees) and the approve → pay → settle workflow (managers, HR, accountant). */
export function CustodyPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { hasEmployee, isLoading } = useMyEmployee();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: "mine", show: can(PERMISSIONS.CUSTODY_REQUEST) && hasEmployee },
    { id: "manage", show: can(PERMISSIONS.CUSTODY_READ) },
  ].filter((x) => x.show);
  const tab = tabs.find((x) => x.id === params.get("tab"))?.id ?? tabs[0]?.id ?? "";
  const shows = (id: string): boolean => tabs.some((x) => x.id === id);
  return (
    <div>
      <PageHeader title={t("custody.title")} description={t("custody.description")} />
      {isLoading && <Skeleton className="h-40" />}
      {!isLoading && tabs.length === 0 && <Alert tone="info">{t("common.noEmployeeRecord")}</Alert>}
      {!isLoading && tabs.length > 0 && (
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        {tabs.length > 1 && (
          <TabsList>
            {tabs.map((x) => (
              <TabsTrigger key={x.id} value={x.id}>
                {t(`custody.tabs.${x.id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {shows("mine") && (
          <TabsContent value="mine">
            <MyCustodyTab />
          </TabsContent>
        )}
        <TabsContent value="manage">
          <ManageTab />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
