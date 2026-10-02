import { PERMISSIONS, WARNING_TYPES, type IssueWarning, type WarningView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { DecisionDialog } from "@/components/decision-dialog";
import { ListViewTabs, useListView } from "@/components/list-view-tabs";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { DecisionBar } from "@/components/decision-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { TableSkeleton } from "@/components/ui/skeleton";
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
    mutationFn: ({ p, note, issue }: { p: Pending; note: string; issue?: IssueWarning }) =>
      apiJson(`/api/v1/warnings/${p.w.id}/${p.action}`, {
        method: "POST",
        ...jsonBody(issue ?? (p.action === "rescind" ? { reason: note } : note ? { note } : {})),
      }),
    onSuccess: async () => {
      toast.success(t("common.changesSaved"));
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["warnings"] });
    },
    onError: (e) => setError(warningError(t, e)),
  });

  if (list.isLoading) return <TableSkeleton />;
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
                {w.status === "issued" && w.objectionUntil && (
                  <p className="mt-1 text-meta text-ink-muted">{t("discipline.objectionUntil", { date: w.objectionUntil })}</p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  {(w.actions.includes("issue") || w.actions.includes("reject")) && (
                    <DecisionBar
                      approveLabel={t("discipline.issue")}
                      onApprove={w.actions.includes("issue") ? () => open({ w, action: "issue" }) : undefined}
                      onReject={w.actions.includes("reject") ? () => open({ w, action: "reject" }) : undefined}
                    />
                  )}
                  {w.actions.includes("rescind") && <Button size="sm" variant="ghost" onClick={() => open({ w, action: "rescind" })}>{t("discipline.rescind")}</Button>}
                  {w.status === "proposed" && !w.actions.includes("issue") && <span className="text-meta text-ink-muted">{t("discipline.waitingHr")}</span>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pending?.action === "issue" && (
        <IssueWarningDialog
          warning={pending.w}
          pending={act.isPending}
          error={error}
          onConfirm={(issue) => act.mutate({ p: pending, note: "", issue })}
          onClose={() => setPending(null)}
        />
      )}
      {pending && pending.action !== "issue" && (
        <DecisionDialog
          title={t(`discipline.confirm.${pending.action}`)}
          confirmLabel={t(`discipline.${pending.action}`)}
          danger
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

function warningError(t: (key: string) => string, e: unknown): string {
  if (e instanceof ApiError && e.code === "warnings.not_proposed") return t("discipline.errors.alreadyDecided");
  if (e instanceof ApiError && e.code === "warnings.statement_required") return t("discipline.errors.statementRequired");
  return t("discipline.errors.failed");
}

/** The employee's statement as recorded (or that it isn't yet). */
export function WarningStatement({ warning }: { warning: WarningView }): React.JSX.Element {
  const { t } = useTranslation();
  const s = warning.statement;
  if (!s) return <p className="text-dense text-ink-muted">{t("discipline.statement.notYet")}</p>;
  return (
    <div className="space-y-1 text-dense">
      {s.declined ? <p className="font-medium">{t("discipline.statement.declinedShown")}</p> : <p className="whitespace-pre-line">{s.text}</p>}
      <p className="text-meta text-ink-muted">{t("discipline.statement.recordedOn", { date: s.recordedAt.slice(0, 10) })}</p>
    </div>
  );
}

/**
 * Issue a proposed warning. The employee must have been heard first (business-rules.md "Warnings"): when no
 * statement is on record yet, HR records it here — what the employee said, or that they declined.
 */
export function IssueWarningDialog({
  warning,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  warning: WarningView;
  pending: boolean;
  error: string | null;
  onConfirm: (body: IssueWarning) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"given" | "declined" | "">("");
  const [statement, setStatement] = useState("");
  const [note, setNote] = useState("");
  const heard = warning.statement !== null;
  const ready = heard || mode === "declined" || (mode === "given" && statement.trim().length >= 3);
  const name = warning.employee ? (i18n.language === "ar" ? warning.employee.fullNameAr : warning.employee.fullNameEn) : "";
  const submit = (): void => {
    const body: IssueWarning = note.trim() ? { note: note.trim() } : {};
    if (!heard && mode === "declined") body.statementDeclined = true;
    if (!heard && mode === "given") body.statement = statement.trim();
    onConfirm(body);
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("discipline.confirm.issue")}</DialogTitle>
          <DialogDescription>
            {name && <span className="font-medium text-ink">{name} · {t(`discipline.types.${warning.type}`)}. </span>}
            {t("discipline.confirm.issueHint")}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-dense font-medium">{t("discipline.statement.title")}</legend>
          {heard ? (
            <WarningStatement warning={warning} />
          ) : (
            <>
              <p className="text-meta text-ink-muted">{t("discipline.statement.hint")}</p>
              {(["given", "declined"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-dense">
                  <input type="radio" name="statement-mode" checked={mode === m} onChange={() => setMode(m)} className="size-4 accent-primary" />
                  {t(`discipline.statement.${m}`)}
                </label>
              ))}
              {mode === "given" && (
                <Field label={t("discipline.statement.text")} htmlFor="w-statement" required>
                  <Textarea id="w-statement" rows={4} maxLength={2000} value={statement} onChange={(e) => setStatement(e.target.value)} />
                </Field>
              )}
            </>
          )}
        </fieldset>
        <Field label={t("discipline.issueNote")} htmlFor="w-issue-note">
          <Textarea id="w-issue-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button loading={pending} disabled={!ready} onClick={submit}>
            {t("discipline.issue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Propose a warning; HR then issues it (or rejects it). */
export function ProposeWarningButton({ employeeId, compact = false }: { employeeId?: string; compact?: boolean }): React.JSX.Element | null {
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
        icon={<FileWarning />}
        // In a record's action row it sits with the other secondary actions.
        variant={compact ? "secondary" : "primary"}
        size={compact ? "sm" : "default"}
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
          {w.status === "issued" && w.objectionUntil && <p className="mt-1 text-meta text-ink-muted">{t("discipline.objectionUntil", { date: w.objectionUntil })}</p>}
        </div>
      ))}
      </div>
    </Panel>
  );
}
