import { PERMISSIONS, WARNING_TYPES, type WarningView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { DecisionDialog } from "@/components/decision-dialog";
import { ListViewTabs, useListView } from "@/components/list-view-tabs";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { EmployeePicker } from "@/features/employees/employee-picker";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";
import { useFormCheck } from "@/lib/use-form-check";

const STATUS_TONE: Record<WarningView["status"], Tone> = { proposed: "warning", issued: "danger", rejected: "neutral", rescinded: "neutral" };
const TYPE_TONE: Record<WarningView["type"], Tone> = { verbal: "info", written: "warning", final: "danger" };
const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

type Pending = { w: WarningView; action: "issue" | "reject" | "rescind" };

/** The warnings table with actions — used on the الإنذارات page and on an employee's page. */
export function WarningsList({ status, employeeId }: { status?: string; employeeId?: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (employeeId) qs.set("employeeId", employeeId);
  const list = useQuery({ queryKey: ["warnings", status ?? "", employeeId ?? ""], queryFn: () => apiJson<WarningView[]>(`/api/v1/warnings?${qs.toString()}`) });
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (p: Pending): void => {
    setError(null);
    setPending(p);
  };
  const act = useMutation({
    mutationFn: ({ p, note }: { p: Pending; note: string }) =>
      apiJson(`/api/v1/warnings/${p.w.id}/${p.action}`, { method: "POST", ...jsonBody(p.action === "rescind" ? { reason: note } : note ? { note } : {}) }),
    onSuccess: async () => {
      toast.success(t("common.changesSaved"));
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["warnings"] });
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "warnings.not_proposed" ? t("discipline.errors.alreadyDecided") : t("discipline.errors.failed")),
  });

  if (list.isLoading) return <Skeleton className="h-40" />;
  if (list.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  if (list.data?.length === 0)
    return (
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState message={status === "proposed" ? t("discipline.emptyProposed") : status === "issued" ? t("discipline.emptyIssued") : t("discipline.empty")} />
      </div>
    );
  return (
    <>
      <Table>
        <TableHeader>
          <tr>
            {!employeeId && <TableHead>{t("discipline.employee")}</TableHead>}
            <TableHead>{t("discipline.type")}</TableHead>
            <TableHead className="w-28">{t("discipline.incidentDate")}</TableHead>
            <TableHead>{t("discipline.reason")}</TableHead>
            <TableHead>{t("discipline.status")}</TableHead>
            <TableHead className="w-44"><span className="sr-only">{t("setup.actions")}</span></TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {list.data?.map((w) => (
            <TableRow key={w.id}>
              {!employeeId && (
                <TableCell>
                  {w.employee && (
                    <Link className="font-medium underline-offset-2 hover:underline" to={`/employees/${w.employee.id}?tab=warnings`}>
                      {i18n.language === "ar" ? w.employee.fullNameAr : w.employee.fullNameEn}
                    </Link>
                  )}
                </TableCell>
              )}
              <TableCell><Badge tone={TYPE_TONE[w.type]}>{t(`discipline.types.${w.type}`)}</Badge></TableCell>
              <TableCell className="tabular-nums"><bdi>{w.incidentDate}</bdi></TableCell>
              <TableCell className="max-w-sm">
                <p className="line-clamp-2 text-dense">{w.reason}</p>
                {w.rescindedReason && <p className="text-meta text-ink-muted">{t("discipline.rescindedBecause", { reason: w.rescindedReason })}</p>}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={STATUS_TONE[w.status]}>{t(`discipline.statuses.${w.status}`)}</Badge>
                  {w.status === "issued" && (w.active ? <Badge tone="warning">{t("discipline.active")}</Badge> : <Badge tone="neutral">{t("discipline.expired")}</Badge>)}
                  {w.status === "issued" && <Badge tone={w.acknowledgedAt ? "success" : "neutral"}>{w.acknowledgedAt ? t("discipline.acknowledged") : t("discipline.notAcknowledged")}</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {w.actions.includes("issue") && <Button size="sm" onClick={() => open({ w, action: "issue" })}>{t("discipline.issue")}</Button>}
                  {w.actions.includes("reject") && <Button size="sm" variant="ghost" onClick={() => open({ w, action: "reject" })}>{t("discipline.reject")}</Button>}
                  {w.actions.includes("rescind") && <Button size="sm" variant="ghost" onClick={() => open({ w, action: "rescind" })}>{t("discipline.rescind")}</Button>}
                  {w.status === "proposed" && !w.actions.includes("issue") && <span className="text-meta text-ink-muted">{t("discipline.waitingHr")}</span>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pending && (
        <DecisionDialog
          title={t(`discipline.confirm.${pending.action}`)}
          description={pending.action === "issue" ? t("discipline.confirm.issueHint") : undefined}
          confirmLabel={t(`discipline.${pending.action}`)}
          danger={pending.action !== "issue"}
          noteRequired={pending.action === "rescind"}
          noteLabel={pending.action === "rescind" ? t("discipline.rescindReason") : undefined}
          pending={act.isPending}
          error={error}
          onConfirm={(note) => act.mutate({ p: pending, note })}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

/** Propose a warning; HR then issues it (or rejects it). */
export function ProposeWarningButton({ employeeId }: { employeeId?: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: employeeId ?? "", type: "", incidentDate: today(), reason: "" });
  const check = useFormCheck();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiJson("/api/v1/warnings", { method: "POST", ...jsonBody(form) }),
    onSuccess: async () => {
      toast.success(t("discipline.proposed"));
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["warnings"] });
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "warnings.own" ? t("discipline.errors.own") : t("discipline.errors.failed")),
  });
  if (!can(PERMISSIONS.WARNINGS_PROPOSE)) return null;
  const valid = form.employeeId && form.type && form.incidentDate && form.incidentDate <= today() && form.reason.trim().length >= 3;
  return (
    <>
      <Button
        icon={<Plus />}
        onClick={() => {
          setForm({ employeeId: employeeId ?? "", type: "", incidentDate: today(), reason: "" });
          check.reset();
          setError(null);
          setOpen(true);
        }}
      >
        {t("discipline.propose")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discipline.propose")}</DialogTitle>
          </DialogHeader>
          <form onBlur={check.onBlur}
            id="warning-form"
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (check.submit(Boolean(valid))) save.mutate();
            }}
          >
            {!employeeId && (
              <div className="sm:col-span-2">
                <Field label={t("discipline.employee")} htmlFor="w-employee" required error={check.show("w-employee") && !form.employeeId ? t("employees.form.required") : undefined}>
                  <EmployeePicker id="w-employee" value={form.employeeId} onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))} />
                </Field>
              </div>
            )}
            <Field label={t("discipline.type")} htmlFor="w-type" required error={check.show("w-type") && !form.type ? t("employees.form.required") : undefined}>
              <NativeSelect id="w-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="">{t("common.choose")}</option>
                {WARNING_TYPES.map((x) => (
                  <option key={x} value={x}>{t(`discipline.types.${x}`)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("discipline.incidentDate")} htmlFor="w-date" required>
              <DatePicker id="w-date" max={today()} value={form.incidentDate} onChange={(v) => setForm((f) => ({ ...f, incidentDate: v }))} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t("discipline.reason")}
                htmlFor="w-reason"
                required
                hint={t("discipline.reasonHint")}
                error={check.show("w-reason") && form.reason.trim().length < 3 ? t("employees.form.required") : undefined}
              >
                <Textarea id="w-reason" rows={4} maxLength={1000} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              </Field>
            </div>
            {error && <Alert className="sm:col-span-2">{error}</Alert>}
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" form="warning-form" loading={save.isPending}>
              {t("discipline.submitProposal")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


/** الإنذارات: proposals waiting for HR, issued warnings, and everything. */
export function WarningsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [view, setView] = useListView(can(PERMISSIONS.WARNINGS_ISSUE) ? "pending" : "all");
  return (
    <div>
      <PageHeader title={t("discipline.title")} description={t("discipline.description")} actions={<ProposeWarningButton />} />
      <ListViewTabs value={view} onChange={setView} />
      <div className="mt-4">
        <WarningsList status={view === "pending" ? "proposed" : undefined} />
      </div>
    </div>
  );
}

/** The employee's own warnings, with "I have read it" (acknowledge). */
export function MyWarningsPanel(): React.JSX.Element | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["warnings", "me"], queryFn: () => apiJson<WarningView[]>("/api/v1/me/warnings") });
  const ack = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/me/warnings/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warnings", "me"] }),
  });
  const [params] = useSearchParams();
  const hasItems = (list.data?.length ?? 0) > 0;
  // Notifications link here with ?section=warnings.
  useEffect(() => {
    if (hasItems && params.get("section") === "warnings") document.getElementById("warnings")?.scrollIntoView({ behavior: "smooth" });
  }, [hasItems, params]);
  if (!list.data || list.data.length === 0) return null;
  return (
    <Panel id="warnings">
      <PanelHeader title={t("discipline.mine")} />
      <div className="space-y-3">
      {list.data.map((w) => (
        <div key={w.id} className="rounded-panel border border-line p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={TYPE_TONE[w.type]}>{t(`discipline.types.${w.type}`)}</Badge>
            <span className="text-meta tabular-nums text-ink-muted"><bdi>{w.incidentDate}</bdi></span>
            {w.status === "rescinded" && <Badge tone="neutral">{t("discipline.statuses.rescinded")}</Badge>}
          </div>
          <p className="whitespace-pre-line text-body">{w.reason}</p>
          {w.actions.includes("acknowledge") && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" loading={ack.isPending} onClick={() => ack.mutate(w.id)}>{t("discipline.acknowledge")}</Button>
              <span className="text-meta text-ink-muted">{t("discipline.acknowledgeHint")}</span>
            </div>
          )}
          {w.acknowledgedAt && <p className="mt-2 text-meta text-ink-muted">{t("discipline.acknowledged")}</p>}
        </div>
      ))}
      </div>
    </Panel>
  );
}
