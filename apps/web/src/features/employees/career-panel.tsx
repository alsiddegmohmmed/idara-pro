import { PERMISSIONS, type AssignmentView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { employeesKey, useEmployees, useRefs } from "./api";
import { nameIn } from "./employee-name";

const historyKey = (id: string) => ["assignments", id] as const;
const todayIso = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

const TRANSFER_ERRORS: Record<string, string> = {
  "employees.transfer.nothing_to_change": "employees.career.errors.nothingToChange",
  "employees.transfer.before_hire": "employees.career.errors.beforeHire",
  "employees.assignment.before_current": "employees.career.errors.beforeCurrent",
  "employees.branch_out_of_scope": "employees.career.errors.branchOutOfScope",
  "employees.transfer_forbidden": "employees.career.errors.forbidden",
  "employees.manager_is_self": "employees.career.errors.managerIsSelf",
};

/** Career history (ADR-0012): where the employee worked, as what, under whom, and a scheduled change. */
export function CareerPanel({ employee }: { employee: Employee }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: historyKey(employee.id), queryFn: () => apiJson<AssignmentView[]>(`/api/v1/employees/${employee.id}/assignments`) });
  const branches = useRefs("branches");
  const departments = useRefs("departments");
  const employees = useEmployees();
  const [open, setOpen] = useState(false);
  const canTransfer = can(PERMISSIONS.EMPLOYEES_TRANSFER);

  const cancel = useMutation({
    mutationFn: () => apiJson(`/api/v1/employees/${employee.id}/transfers/scheduled`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("employees.career.cancelled"));
      return queryClient.invalidateQueries({ queryKey: historyKey(employee.id) });
    },
    onError: () => toast.error(t("employees.career.cancelFailed")),
  });

  const branchName = (id: string | null) => branches.data?.find((b) => b.id === id)?.name ?? (id ? "—" : t("employees.career.none"));
  const departmentName = (id: string | null) => departments.data?.find((d) => d.id === id)?.name ?? (id ? "—" : t("employees.career.none"));
  const managerName = (id: string | null) => {
    const m = employees.data?.find((e) => e.id === id);
    return m ? nameIn(i18n, m) : id ? "—" : t("employees.career.none");
  };

  return (
    <Panel>
      <PanelHeader
        title={t("employees.career.title")}
        actions={
          canTransfer && (
            <Button variant="secondary" icon={<ArrowLeftRight />} onClick={() => setOpen(true)}>
              {t("employees.career.transfer")}
            </Button>
          )
        }
      />
      {history.isLoading && <Skeleton className="h-24" />}
      {history.isError && <Alert>{t("common.loadFailed")}</Alert>}
      {history.data && history.data.length === 0 && <p className="text-body text-ink-muted">{t("employees.career.empty")}</p>}
      {history.data && history.data.length > 0 && (
        <ol className="space-y-4">
          {history.data.map((a) => (
            <li key={a.id} className="rounded-panel border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={a.scheduled ? "warning" : a.validTo === null ? "success" : "neutral"}>
                  {a.scheduled ? t("employees.career.scheduled") : a.validTo === null ? t("employees.career.current") : t(`employees.career.kinds.${a.kind}`)}
                </Badge>
                <span className="text-meta tabular-nums text-ink-muted">
                  <bdi>
                    {a.validFrom} → {a.validTo ?? (a.scheduled ? "" : t("employees.career.now"))}
                  </bdi>
                </span>
                {a.scheduled && canTransfer && (
                  <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                    {t("employees.career.cancel")}
                  </Button>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-dense sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="inline text-ink-muted">{t("employees.fields.branch")}: </dt><dd className="inline">{branchName(a.branchId)}</dd></div>
                <div><dt className="inline text-ink-muted">{t("employees.fields.department")}: </dt><dd className="inline">{departmentName(a.departmentId)}</dd></div>
                <div><dt className="inline text-ink-muted">{t("employees.fields.jobTitle")}: </dt><dd className="inline">{a.jobTitle ?? t("employees.career.none")}</dd></div>
                <div><dt className="inline text-ink-muted">{t("employees.fields.manager")}: </dt><dd className="inline">{managerName(a.managerId)}</dd></div>
              </dl>
              {a.reason && <p className="mt-2 text-dense text-ink-muted">{a.reason}</p>}
            </li>
          ))}
        </ol>
      )}
      {canTransfer && <TransferDialog employee={employee} open={open} onOpenChange={setOpen} />}
    </Panel>
  );
}

function TransferDialog({ employee, open, onOpenChange }: { employee: Employee; open: boolean; onOpenChange: (v: boolean) => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const branches = useRefs("branches");
  const departments = useRefs("departments");
  const employees = useEmployees();
  const initial = useMemo(
    () => ({
      effectiveDate: todayIso(),
      branchId: employee.branchId ?? "",
      departmentId: employee.departmentId ?? "",
      jobTitle: employee.jobTitle ?? "",
      managerId: employee.managerId ?? "",
      reason: "",
    }),
    [employee],
  );
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = useMutation({
    mutationFn: () => {
      const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
      // Only what changed: omitted fields keep their current value on the server.
      const changes: Record<string, string | null> = {};
      if (orNull(form.branchId) !== employee.branchId) changes.branchId = orNull(form.branchId);
      if (orNull(form.departmentId) !== employee.departmentId) changes.departmentId = orNull(form.departmentId);
      if (orNull(form.jobTitle) !== employee.jobTitle) changes.jobTitle = orNull(form.jobTitle);
      if (orNull(form.managerId) !== employee.managerId) changes.managerId = orNull(form.managerId);
      return apiJson<{ scheduled: AssignmentView | null }>(`/api/v1/employees/${employee.id}/transfers`, {
        method: "POST",
        ...jsonBody({ effectiveDate: form.effectiveDate, reason: form.reason.trim(), ...changes }),
      });
    },
    onSuccess: async (result) => {
      toast.success(result.scheduled ? t("employees.career.savedScheduled", { date: form.effectiveDate }) : t("employees.career.saved"));
      onOpenChange(false);
      setForm(initial);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyKey(employee.id) }),
        queryClient.invalidateQueries({ queryKey: employeesKey }),
      ]);
    },
    onError: (e: Error) => setError(t((e instanceof ApiError && TRANSFER_ERRORS[e.code]) || "employees.career.errors.failed")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setForm(initial);
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("employees.career.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("employees.career.dialogHint")}</DialogDescription>
        </DialogHeader>
        <form
          id="transfer-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
        >
          <Field label={t("employees.career.effectiveDate")} htmlFor="t-date" hint={t("employees.career.effectiveHint")}>
            <Input id="t-date" type="date" dir="ltr" required value={form.effectiveDate} onChange={set("effectiveDate")} />
          </Field>
          <Field label={t("employees.fields.branch")} htmlFor="t-branch">
            <NativeSelect id="t-branch" value={form.branchId} onChange={set("branchId")}>
              <option value="">{t("employees.career.none")}</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("employees.fields.department")} htmlFor="t-dept">
            <NativeSelect id="t-dept" value={form.departmentId} onChange={set("departmentId")}>
              <option value="">{t("employees.career.none")}</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("employees.fields.jobTitle")} htmlFor="t-job">
            <Input id="t-job" value={form.jobTitle} onChange={set("jobTitle")} />
          </Field>
          <Field label={t("employees.fields.manager")} htmlFor="t-manager">
            <NativeSelect id="t-manager" value={form.managerId} onChange={set("managerId")}>
              <option value="">{t("employees.career.none")}</option>
              {employees.data
                ?.filter((m) => m.id !== employee.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>{nameIn(i18n, m)}</option>
                ))}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("employees.career.reason")} htmlFor="t-reason">
              <Textarea id="t-reason" required maxLength={500} value={form.reason} onChange={set("reason")} />
            </Field>
          </div>
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="transfer-form" loading={submit.isPending} disabled={form.reason.trim() === ""}>
            {t("employees.career.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
