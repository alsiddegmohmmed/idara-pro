import { PERMISSIONS, SHORTLEAVE_KINDS, type ShortLeaveAllowance, type ShortLeaveView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { DecisionDialog } from "@/components/decision-dialog";
import { ListViewTabs, useListView } from "@/components/list-view-tabs";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatDuration, ltr, todayInRiyadh } from "@/lib/dates";
import { useOpenOnNewParam } from "@/lib/use-new-param";

const STATUS_TONE: Record<ShortLeaveView["status"], Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
const KNOWN_ERRORS = ["overlap", "not_working_day", "too_old", "own_request", "not_pending", "out_of_scope", "employee_inactive"];
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function useShortLeaveError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    if (!(e instanceof ApiError)) return t("shortleave.errors.failed");
    if (e.code === "shortleave.allowance_exceeded") return t("shortleave.errors.allowance_exceeded", { remaining: formatDuration(Number(e.details.remaining ?? 0)) });
    const key = KNOWN_ERRORS.find((k) => e.code === `shortleave.${k}`);
    return key ? t(`shortleave.errors.${key}`) : t("shortleave.errors.failed");
  };
}

function Times({ r }: { r: Pick<ShortLeaveView, "fromTime" | "toTime" | "minutes"> }): React.JSX.Element {
  return (
    <span>
      <bdi dir="ltr" className="tabular-nums">{r.fromTime} – {r.toTime}</bdi>
      <span className="ms-2 text-meta text-ink-muted">(<bdi dir="ltr">{formatDuration(r.minutes)}</bdi>)</span>
    </span>
  );
}

// ---------------- mine ----------------

function AllowanceCard({ a }: { a: ShortLeaveAllowance }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel className="p-5">
      <p className="text-meta font-medium text-ink-muted">{t("shortleave.allowance.title", { month: a.month })}</p>
      <p className="mt-1 text-page-title tabular-nums">
        <bdi dir="ltr">{formatDuration(a.remainingMinutes)}</bdi>{" "}
        <span className="text-body font-normal text-ink-muted">/ <bdi dir="ltr">{formatDuration(a.allowanceMinutes)}</bdi></span>
      </p>
      <p className="text-meta text-ink-muted">
        {t("shortleave.allowance.remaining")}
        {a.pendingMinutes > 0 && ` · ${t("shortleave.allowance.pending", { time: formatDuration(a.pendingMinutes) })}`}
      </p>
    </Panel>
  );
}

function RequestDialog({ open, onClose, remaining }: { open: boolean; onClose: () => void; remaining: number | null }): React.JSX.Element {
  const { t } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const blank = { date: todayInRiyadh(), kind: "late_arrival", fromTime: "", toTime: "", reason: "" };
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState(false);
  const minutes = form.fromTime && form.toTime ? toMinutes(form.toTime) - toMinutes(form.fromTime) : 0;
  const timesOk = minutes > 0;
  const valid = form.date !== "" && timesOk && form.reason.trim().length >= 3;
  const submit = useMutation({
    mutationFn: () => apiJson("/api/v1/shortleave/requests", { method: "POST", ...jsonBody({ ...form, reason: form.reason.trim() }) }),
    onSuccess: () => {
      toast.success(t("shortleave.request.sent"));
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
      onClose();
    },
  });
  const close = (): void => {
    submit.reset();
    setForm(blank);
    setTouched(false);
    onClose();
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shortleave.request.title")}</DialogTitle>
          <DialogDescription>{t("shortleave.request.hint")}</DialogDescription>
        </DialogHeader>
        <form
          id="shortleave-form"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) submit.mutate();
          }}
        >
          <Field label={t("shortleave.kind")} htmlFor="sl-kind" required>
            <NativeSelect id="sl-kind" value={form.kind} onChange={set("kind")}>
              {SHORTLEAVE_KINDS.map((k) => (
                <option key={k} value={k}>{t(`shortleave.kinds.${k}`)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("shortleave.date")} htmlFor="sl-date" required hint={t("shortleave.request.dateHint")}>
            <Input id="sl-date" type="date" dir="ltr" value={form.date} onChange={set("date")} />
          </Field>
          <Field label={t("shortleave.from")} htmlFor="sl-from" required error={touched && !form.fromTime ? t("employees.form.required") : undefined}>
            <Input id="sl-from" type="time" dir="ltr" value={form.fromTime} onChange={set("fromTime")} />
          </Field>
          <Field
            label={t("shortleave.to")}
            htmlFor="sl-to"
            required
            error={touched && !form.toTime ? t("employees.form.required") : form.fromTime && form.toTime && !timesOk ? t("shortleave.errors.to_after_from") : undefined}
          >
            <Input id="sl-to" type="time" dir="ltr" min={form.fromTime || undefined} value={form.toTime} onChange={set("toTime")} />
          </Field>
          {timesOk && (
            <p className="text-dense text-ink-muted sm:col-span-2">
              {t("shortleave.request.duration")} <bdi dir="ltr" className="font-medium text-ink">{formatDuration(minutes)}</bdi>
              {remaining !== null && minutes > remaining && <span className="ms-2 text-danger">{t("shortleave.request.overAllowance")}</span>}
            </p>
          )}
          <div className="sm:col-span-2">
            <Field label={t("shortleave.reason")} htmlFor="sl-reason" required error={touched && form.reason.trim().length < 3 ? t("employees.form.required") : undefined}>
              <Textarea id="sl-reason" rows={3} maxLength={500} value={form.reason} onChange={set("reason")} />
            </Field>
          </div>
          {submit.isError && <Alert className="sm:col-span-2">{errorText(submit.error)}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="shortleave-form" loading={submit.isPending}>
            {t("shortleave.request.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyShortLeave(): React.JSX.Element {
  const { t } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const allowance = useQuery({ queryKey: ["shortleave", "allowance"], queryFn: () => apiJson<ShortLeaveAllowance>("/api/v1/shortleave/me/allowance") });
  const list = useQuery({ queryKey: ["shortleave", "mine"], queryFn: () => apiJson<ShortLeaveView[]>("/api/v1/shortleave/me/requests") });
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<ShortLeaveView | null>(null);
  useOpenOnNewParam(() => setOpen(true));
  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/shortleave/requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("shortleave.cancelled"));
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
    },
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
        {allowance.data ? <AllowanceCard a={allowance.data} /> : <Skeleton className="h-28" />}
        <div>
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t("shortleave.request.title")}
          </Button>
        </div>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : list.data?.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            message={t("shortleave.emptyMine")}
            action={
              <Button icon={<Plus />} onClick={() => setOpen(true)}>
                {t("shortleave.request.title")}
              </Button>
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-28">{t("shortleave.date")}</TableHead>
              <TableHead>{t("shortleave.kind")}</TableHead>
              <TableHead>{t("shortleave.time")}</TableHead>
              <TableHead>{t("shortleave.status")}</TableHead>
              <TableHead className="w-28"><span className="sr-only">{t("setup.actions")}</span></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {list.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums"><bdi>{r.date}</bdi></TableCell>
                <TableCell>{t(`shortleave.kinds.${r.kind}`)}</TableCell>
                <TableCell><Times r={r} /></TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[r.status]}>{t(`shortleave.statuses.${r.status}`)}</Badge>
                  {r.decisionNote && <p className="mt-1 text-meta text-ink-muted">{r.decisionNote}</p>}
                </TableCell>
                <TableCell>
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        cancel.reset();
                        setCancelling(r);
                      }}
                    >
                      {t("shortleave.cancel")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <RequestDialog open={open} onClose={() => setOpen(false)} remaining={allowance.data?.remainingMinutes ?? null} />
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

function Approvals(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const errorText = useShortLeaveError();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useListView();
  const list = useQuery({
    queryKey: ["shortleave", "list", filter],
    queryFn: () => apiJson<ShortLeaveView[]>(`/api/v1/shortleave/requests${filter === "pending" ? "?status=pending" : ""}`),
  });
  const [deciding, setDeciding] = useState<{ r: ShortLeaveView; action: "approve" | "reject" } | null>(null);
  const decide = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note: string }) =>
      apiJson(`/api/v1/shortleave/requests/${id}/${action}`, { method: "POST", ...jsonBody(note ? { note } : {}) }),
    onSuccess: () => {
      toast.success(t("common.changesSaved"));
      setDeciding(null);
      void queryClient.invalidateQueries({ queryKey: ["shortleave"] });
    },
  });
  return (
    <div className="space-y-4">
      <ListViewTabs value={filter} onChange={setFilter} />
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : list.data?.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("shortleave.emptyApprovals")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("shortleave.employee")}</TableHead>
              <TableHead className="w-28">{t("shortleave.date")}</TableHead>
              <TableHead>{t("shortleave.kind")}</TableHead>
              <TableHead>{t("shortleave.time")}</TableHead>
              <TableHead>{t("shortleave.reason")}</TableHead>
              <TableHead>{t("shortleave.status")}</TableHead>
              <TableHead className="w-44"><span className="sr-only">{t("setup.actions")}</span></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {list.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.employee && (
                    <>
                      <span className="block font-medium">{nameIn(i18n, r.employee)}</span>
                      <span className="block text-meta text-ink-muted"><bdi>{r.employee.employeeNo}</bdi></span>
                    </>
                  )}
                </TableCell>
                <TableCell className="tabular-nums"><bdi>{r.date}</bdi></TableCell>
                <TableCell>{t(`shortleave.kinds.${r.kind}`)}</TableCell>
                <TableCell><Times r={r} /></TableCell>
                <TableCell className="max-w-xs"><p className="line-clamp-2 text-dense">{r.reason}</p></TableCell>
                <TableCell><Badge tone={STATUS_TONE[r.status]}>{t(`shortleave.statuses.${r.status}`)}</Badge></TableCell>
                <TableCell>
                  {r.status === "pending" &&
                    (r.canDecide ? (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => setDeciding({ r, action: "approve" })}>{t("shortleave.approve")}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeciding({ r, action: "reject" })}>{t("shortleave.reject")}</Button>
                      </div>
                    ) : (
                      <span className="text-meta text-ink-muted">{t("common.waitingOther")}</span>
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {deciding && (
        <DecisionDialog
          title={t(`shortleave.confirm.${deciding.action}`)}
          description={deciding.action === "approve" && deciding.r.kind === "late_arrival" ? t("shortleave.confirm.approveHint") : undefined}
          confirmLabel={t(`shortleave.${deciding.action}`)}
          danger={deciding.action === "reject"}
          pending={decide.isPending}
          error={decide.isError ? errorText(decide.error) : null}
          onConfirm={(note) => decide.mutate({ id: deciding.r.id, action: deciding.action, note })}
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
        <Tabs value={tab} onValueChange={(v) => setParams(new URLSearchParams({ tab: v }), { replace: true })}>
          <TabsList>
            {tabs.map((x) => (
              <TabsTrigger key={x} value={x}>{t(`shortleave.tabs.${x}`)}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="mine" className="mt-4"><MyShortLeave /></TabsContent>
          <TabsContent value="approvals" className="mt-4"><Approvals /></TabsContent>
        </Tabs>
      ) : tab === "approvals" ? (
        <Approvals />
      ) : (
        <MyShortLeave />
      )}
    </div>
  );
}
