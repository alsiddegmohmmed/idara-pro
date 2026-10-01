import { PERMISSIONS, type EnrolmentView, type InsurancePolicyView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { apiJson, jsonBody } from "@/lib/api";

const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** التأمين الطبي: the employee's enrolments in company policies. `basePath` = /employees/:id/insurance or /me/insurance. */
export function InsuranceTab({ basePath, readOnly = false }: { basePath: string; readOnly?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["insurance", basePath], queryFn: () => apiJson<EnrolmentView[]>(basePath) });
  const [editing, setEditing] = useState<EnrolmentView | "new" | null>(null);
  const canManage = !readOnly && can(PERMISSIONS.INSURANCE_MANAGE);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["insurance", basePath] });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`${basePath}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: () => toast.error(t("employees.insurance.failed")),
  });

  if (list.isLoading) return <Skeleton className="h-32" />;
  if (list.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      {canManage && (
        <Button icon={<Plus />} onClick={() => setEditing("new")}>
          {t("employees.insurance.add")}
        </Button>
      )}
      {list.data?.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("employees.insurance.empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.insurance.provider")}</TableHead>
              <TableHead>{t("employees.insurance.class")}</TableHead>
              <TableHead>{t("employees.insurance.member")}</TableHead>
              <TableHead>{t("employees.insurance.period")}</TableHead>
              {canManage && <TableHead className="w-24"><span className="sr-only">{t("setup.actions")}</span></TableHead>}
            </tr>
          </TableHeader>
          <TableBody>
            {list.data?.map((e) => {
              const expired = e.endDate !== null && e.endDate < today();
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.provider}</div>
                    <div className="text-meta text-ink-muted"><bdi dir="ltr">{e.policyNumber}</bdi></div>
                  </TableCell>
                  <TableCell>{e.class}</TableCell>
                  <TableCell><bdi dir="ltr">{e.memberNumber ?? "—"}</bdi></TableCell>
                  <TableCell>
                    <bdi dir="ltr" className="tabular-nums">{e.startDate} → {e.endDate ?? "…"}</bdi>
                    {expired && <Badge tone="danger" className="ms-2">{t("employees.insurance.expired")}</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label={t("common.edit")} onClick={() => setEditing(e)}>
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("common.delete")}
                          onClick={() => {
                            if (window.confirm(t("setup.confirmDelete"))) remove.mutate(e.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {editing && <EnrolmentDialog basePath={basePath} editing={editing} onClose={() => setEditing(null)} onDone={() => void refresh()} />}
    </div>
  );
}

function EnrolmentDialog({ basePath, editing, onClose, onDone }: { basePath: string; editing: EnrolmentView | "new"; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const policies = useQuery({ queryKey: ["insurance-policies"], queryFn: () => apiJson<InsurancePolicyView[]>("/api/v1/insurance-policies") });
  const init = editing === "new" ? null : editing;
  const [policyId, setPolicyId] = useState(init?.policyId ?? "");
  const [cls, setCls] = useState(init?.class ?? "");
  const [member, setMember] = useState(init?.memberNumber ?? "");
  const [startDate, setStartDate] = useState(init?.startDate ?? today());
  const [endDate, setEndDate] = useState(init && init.endDate !== init.policyEndDate ? (init.endDate ?? "") : "");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = policyId !== "" && cls.trim() !== "" && startDate !== "" && (!endDate || endDate >= startDate);
  const save = useMutation({
    mutationFn: () => {
      const body = { policyId, class: cls.trim(), memberNumber: member.trim() || null, startDate, endDate: endDate || null };
      return init ? apiJson(`${basePath}/${init.id}`, { method: "PATCH", ...jsonBody(body) }) : apiJson(basePath, { method: "POST", ...jsonBody(body) });
    },
    onSuccess: () => {
      toast.success(t("common.changesSaved"));
      onDone();
      onClose();
    },
    onError: () => setError(t("employees.insurance.failed")),
  });
  const active = policies.data?.filter((p) => p.endDate >= today()) ?? [];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{init ? t("employees.insurance.edit") : t("employees.insurance.add")}</DialogTitle>
        </DialogHeader>
        {policies.data && policies.data.length === 0 ? (
          <Alert tone="info">
            {t("employees.insurance.noPolicies")}{" "}
            <Link className="underline underline-offset-2" to="/setup?tab=insurance">
              {t("employees.insurance.addPolicy")}
            </Link>
          </Alert>
        ) : (
          <form
            id="enrol-form"
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (valid) save.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <Field label={t("employees.insurance.policy")} htmlFor="en-policy" required error={touched && !policyId ? t("employees.form.required") : undefined}>
                <NativeSelect id="en-policy" value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                  <option value="">{t("common.choose")}</option>
                  {(init ? (policies.data ?? []) : active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.provider} — {p.policyNumber} (<bdi dir="ltr">{p.startDate} → {p.endDate}</bdi>)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t("employees.insurance.class")} htmlFor="en-class" required hint={t("employees.insurance.classHint")} error={touched && !cls.trim() ? t("employees.form.required") : undefined}>
              <Input id="en-class" value={cls} onChange={(e) => setCls(e.target.value)} list="insurance-classes" />
            </Field>
            <datalist id="insurance-classes">
              {["VIP", "A", "B", "C"].map((c) => <option key={c} value={c} />)}
            </datalist>
            <Field label={t("employees.insurance.member")} htmlFor="en-member">
              <Input id="en-member" dir="ltr" value={member} onChange={(e) => setMember(e.target.value)} />
            </Field>
            <Field label={t("employees.insurance.start")} htmlFor="en-start" required>
              <Input id="en-start" type="date" dir="ltr" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label={t("employees.insurance.end")} htmlFor="en-end" hint={t("employees.insurance.endHint")}>
              <Input id="en-end" type="date" dir="ltr" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            {error && <Alert className="sm:col-span-2">{error}</Alert>}
          </form>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="enrol-form" loading={save.isPending} disabled={policies.data?.length === 0}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
