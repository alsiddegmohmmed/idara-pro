import { ADJUSTMENT_KINDS, PERMISSIONS, type AdjustmentView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { DecisionDialog } from "@/components/decision-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { EmployeePicker } from "@/features/employees/employee-picker";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { todayInRiyadh } from "@/lib/dates";
import { formatHalalas, sarToHalalas } from "@/lib/money";

const STATUS_TONE: Record<AdjustmentView["status"], Tone> = { proposed: "warning", approved: "success", rejected: "neutral" };
const KIND_TONE: Record<AdjustmentView["kind"], Tone> = { deduction: "danger", bonus: "success", allowance: "info" };
const KNOWN_ERRORS = ["own", "four_eyes", "not_proposed", "no_salary", "period_closed", "out_of_scope"];
const STATUSES = ["proposed", "approved", "rejected"] as const;

const thisMonth = (): string => todayInRiyadh().slice(0, 7);
const shiftMonth = (period: string, n: number): string => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 + n, 1)).toISOString().slice(0, 7);
};

function useAdjustmentError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    if (!(e instanceof ApiError)) return t("adjustments.errors.failed");
    if (e.code === "adjustments.over_cap") {
      const cap = BigInt(String(e.details.capHalalas ?? "0"));
      const already = BigInt(String(e.details.alreadyHalalas ?? "0"));
      const left = cap > already ? cap - already : 0n;
      return t("adjustments.errors.over_cap", { cap: formatHalalas(cap.toString()), left: formatHalalas(left.toString()) });
    }
    const key = KNOWN_ERRORS.find((k) => e.code === `adjustments.${k}`);
    return key ? t(`adjustments.errors.${key}`) : t("adjustments.errors.failed");
  };
}

function ProposeDialog({ open, onClose, period }: { open: boolean; onClose: () => void; period: string }): React.JSX.Element {
  const { t } = useTranslation();
  const errorText = useAdjustmentError();
  const queryClient = useQueryClient();
  const current = thisMonth();
  const periods = [shiftMonth(current, -1), current, shiftMonth(current, 1), shiftMonth(current, 2)];
  const blank = { employeeId: "", period: periods.includes(period) ? period : current, kind: "deduction", amount: "", reason: "" };
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState(false);
  const halalas = sarToHalalas(form.amount);
  const amountOk = halalas !== null && halalas !== "0";
  const valid = form.employeeId !== "" && amountOk && form.reason.trim().length >= 3;
  const submit = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/adjustments", {
        method: "POST",
        ...jsonBody({ employeeId: form.employeeId, period: form.period, kind: form.kind, amountHalalas: halalas, reason: form.reason.trim(), source: "manual" }),
      }),
    onSuccess: () => {
      toast.success(t("adjustments.proposed"));
      void queryClient.invalidateQueries({ queryKey: ["adjustments"] });
      close();
    },
  });
  function close(): void {
    submit.reset();
    setForm(blank);
    setTouched(false);
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adjustments.propose")}</DialogTitle>
          <DialogDescription>{t("adjustments.proposeHint")}</DialogDescription>
        </DialogHeader>
        <form
          id="adjustment-form"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) submit.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Field label={t("adjustments.employee")} htmlFor="adj-employee" required error={touched && !form.employeeId ? t("employees.form.required") : undefined}>
              <EmployeePicker id="adj-employee" value={form.employeeId} onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))} />
            </Field>
          </div>
          <Field label={t("adjustments.kind")} htmlFor="adj-kind" required>
            <NativeSelect id="adj-kind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {ADJUSTMENT_KINDS.map((k) => (
                <option key={k} value={k}>{t(`adjustments.kinds.${k}`)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("adjustments.period")} htmlFor="adj-period" required>
            <NativeSelect id="adj-period" dir="ltr" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("adjustments.amount")}
            htmlFor="adj-amount"
            required
            hint={t("adjustments.amountHint")}
            error={touched && !amountOk ? t("adjustments.errors.amount") : undefined}
          >
            <Input id="adj-amount" dir="ltr" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("adjustments.reason")} htmlFor="adj-reason" required error={touched && form.reason.trim().length < 3 ? t("employees.form.required") : undefined}>
              <Textarea id="adj-reason" rows={3} maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </Field>
          </div>
          {submit.isError && <Alert className="sm:col-span-2">{errorText(submit.error)}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="adjustment-form" loading={submit.isPending}>
            {t("adjustments.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** الخصومات والإضافات: one-off deductions, bonuses and allowances for a pay month — proposed, then approved by someone else. */
export function AdjustmentsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const errorText = useAdjustmentError();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const period = /^\d{4}-\d{2}$/.test(params.get("period") ?? "") ? (params.get("period") as string) : thisMonth();
  const status = STATUSES.find((s) => s === params.get("status"));
  const setParam = (k: string, v: string | undefined): void => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const qs = new URLSearchParams({ period, ...(status ? { status } : {}) });
  const list = useQuery({ queryKey: ["adjustments", period, status ?? ""], queryFn: () => apiJson<AdjustmentView[]>(`/api/v1/adjustments?${qs.toString()}`) });
  const [proposing, setProposing] = useState(false);
  const [deciding, setDeciding] = useState<{ a: AdjustmentView; action: "approve" | "reject" } | null>(null);
  const decide = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note: string }) =>
      apiJson(`/api/v1/adjustments/${id}/${action}`, { method: "POST", ...jsonBody(note ? { note } : {}) }),
    onSuccess: () => {
      toast.success(t("common.changesSaved"));
      setDeciding(null);
      void queryClient.invalidateQueries({ queryKey: ["adjustments"] });
    },
  });

  const totals = (list.data ?? [])
    .filter((a) => a.status === "approved")
    .reduce(
      (acc, a) => (a.kind === "deduction" ? { ...acc, minus: acc.minus + BigInt(a.amountHalalas) } : { ...acc, plus: acc.plus + BigInt(a.amountHalalas) }),
      { plus: 0n, minus: 0n },
    );

  return (
    <div>
      <PageHeader
        title={t("adjustments.title")}
        description={t("adjustments.description")}
        actions={
          can(PERMISSIONS.ADJUSTMENTS_PROPOSE) ? (
            <Button icon={<Plus />} onClick={() => setProposing(true)}>
              {t("adjustments.propose")}
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t("adjustments.period")} htmlFor="adj-filter-period">
          <Input id="adj-filter-period" type="month" dir="ltr" className="w-44" value={period} onChange={(e) => setParam("period", e.target.value || undefined)} />
        </Field>
        <Field label={t("adjustments.status")} htmlFor="adj-filter-status">
          <NativeSelect id="adj-filter-status" className="w-44" value={status ?? ""} onChange={(e) => setParam("status", e.target.value || undefined)}>
            <option value="">{t("adjustments.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`adjustments.statuses.${s}`)}</option>
            ))}
          </NativeSelect>
        </Field>
        {(totals.plus > 0n || totals.minus > 0n) && (
          <p className="ms-auto text-dense text-ink-muted">
            {t("adjustments.approvedTotals")}{" "}
            <bdi dir="ltr" className="font-medium text-success">+{formatHalalas(totals.plus.toString())}</bdi>{" · "}
            <bdi dir="ltr" className="font-medium text-danger">−{formatHalalas(totals.minus.toString())}</bdi> {t("employees.salary.sar")}
          </p>
        )}
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : list.data?.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            message={status ? t("adjustments.emptyFiltered") : t("adjustments.empty")}
            action={
              can(PERMISSIONS.ADJUSTMENTS_PROPOSE) && !status ? (
                <Button icon={<Plus />} onClick={() => setProposing(true)}>
                  {t("adjustments.propose")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("adjustments.employee")}</TableHead>
              <TableHead>{t("adjustments.kind")}</TableHead>
              <TableHead className="text-end">{t("adjustments.amount")}</TableHead>
              <TableHead>{t("adjustments.reason")}</TableHead>
              <TableHead>{t("adjustments.status")}</TableHead>
              <TableHead className="w-44"><span className="sr-only">{t("setup.actions")}</span></TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {list.data?.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {a.employee && (
                    <>
                      <span className="block font-medium">{nameIn(i18n, a.employee)}</span>
                      <span className="block text-meta text-ink-muted"><bdi>{a.employee.employeeNo}</bdi></span>
                    </>
                  )}
                </TableCell>
                <TableCell><Badge tone={KIND_TONE[a.kind]}>{t(`adjustments.kinds.${a.kind}`)}</Badge></TableCell>
                <TableCell className="text-end tabular-nums"><bdi dir="ltr">{formatHalalas(a.amountHalalas)}</bdi></TableCell>
                <TableCell className="max-w-xs">
                  <p className="line-clamp-2 text-dense">{a.reason}</p>
                  {a.decisionNote && <p className="text-meta text-ink-muted">{a.decisionNote}</p>}
                </TableCell>
                <TableCell><Badge tone={STATUS_TONE[a.status]}>{t(`adjustments.statuses.${a.status}`)}</Badge></TableCell>
                <TableCell>
                  {a.status === "proposed" &&
                    (a.canDecide ? (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => setDeciding({ a, action: "approve" })}>{t("adjustments.approve")}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeciding({ a, action: "reject" })}>{t("adjustments.reject")}</Button>
                      </div>
                    ) : (
                      // Four eyes: the proposer (or anyone without approve) sees why there is no button.
                      <span className="text-meta text-ink-muted">{t("adjustments.waitingOther")}</span>
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ProposeDialog open={proposing} onClose={() => setProposing(false)} period={period} />
      {deciding && (
        <DecisionDialog
          title={t(`adjustments.confirm.${deciding.action}`)}
          description={deciding.action === "approve" ? t("adjustments.confirm.approveHint") : undefined}
          confirmLabel={t(`adjustments.${deciding.action}`)}
          danger={deciding.action === "reject"}
          pending={decide.isPending}
          error={decide.isError ? errorText(decide.error) : null}
          onConfirm={(note) => decide.mutate({ id: deciding.a.id, action: deciding.action, note })}
          onClose={() => {
            decide.reset();
            setDeciding(null);
          }}
        />
      )}
    </div>
  );
}
