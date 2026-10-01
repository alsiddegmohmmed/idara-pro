import { CONTRACT_TYPES, PERMISSIONS, type ContractView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";

const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const addDays = (iso: string, n: number): string => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const addYears = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return addDays(d.toISOString().slice(0, 10), -1);
};
const daysUntil = (iso: string): number => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime()) / 86_400_000);

const ERRORS: Record<string, string> = {
  "employees.contract.active_exists": "employees.contracts.errors.activeExists",
  "employees.contract.renewal_before_start": "employees.contracts.errors.renewalBeforeStart",
  "employees.contract.invalid_dates": "employees.contracts.errors.invalidDates",
  "employees.contract.end_date_required": "employees.contracts.errors.endRequired",
};

type Mode = { kind: "new" } | { kind: "renew"; from: ContractView } | { kind: "end"; contract: ContractView };

/**
 * العقود: the active contract on top with what's coming up (end, probation), history below. HR adds the first
 * contract, renews it (new period, the old one kept) or ends it. `basePath` = /api/v1/employees/:id/contracts
 * or /api/v1/me/contracts (read-only).
 */
export function ContractsTab({ basePath, readOnly = false }: { basePath: string; readOnly?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["contracts", basePath], queryFn: () => apiJson<ContractView[]>(basePath) });
  const [mode, setMode] = useState<Mode | null>(null);
  const canManage = !readOnly && can(PERMISSIONS.CONTRACTS_MANAGE);
  const active = list.data?.find((c) => c.status === "active");

  if (list.isLoading) return <Skeleton className="h-40" />;
  if (list.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      {!active && canManage && (
        <Button icon={<FilePlus2 />} onClick={() => setMode({ kind: "new" })}>
          {t("employees.contracts.add")}
        </Button>
      )}
      {list.data?.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("employees.contracts.empty")} />
        </div>
      )}
      {list.data?.map((c) => {
        const endIn = c.status === "active" && c.endDate ? daysUntil(c.endDate) : null;
        const probationIn = c.status === "active" && c.probationEndDate ? daysUntil(c.probationEndDate) : null;
        return (
          <Panel key={c.id} className={c.status === "active" ? undefined : "opacity-75"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-section">{t(`employees.contracts.types.${c.type}`)}</h3>
                  <Badge tone={c.status === "active" ? "success" : "neutral"}>{t(`employees.contracts.status.${c.status}`)}</Badge>
                  {endIn !== null && endIn <= 60 && (
                    <Badge tone={endIn < 0 ? "danger" : "warning"}>
                      {endIn < 0 ? t("employees.contracts.expired") : t("employees.contracts.endsIn", { count: endIn })}
                    </Badge>
                  )}
                  {probationIn !== null && probationIn >= 0 && <Badge tone="info">{t("employees.contracts.onProbation", { count: probationIn })}</Badge>}
                </div>
                <dl className="mt-2 grid gap-x-8 gap-y-1 text-dense sm:grid-cols-3">
                  <div>
                    <dt className="text-ink-muted">{t("employees.contracts.start")}</dt>
                    <dd className="tabular-nums"><bdi>{c.startDate}</bdi></dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">{t("employees.contracts.end")}</dt>
                    <dd className="tabular-nums"><bdi>{c.endDate ?? t("employees.contracts.openEnded")}</bdi></dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">{t("employees.contracts.probationEnd")}</dt>
                    <dd className="tabular-nums"><bdi>{c.probationEndDate ?? "—"}</bdi></dd>
                  </div>
                </dl>
                {c.notes && <p className="mt-2 whitespace-pre-line text-dense text-ink-muted">{c.notes}</p>}
              </div>
              {canManage && c.status === "active" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setMode({ kind: "renew", from: c })}>
                    {t("employees.contracts.renew")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode({ kind: "end", contract: c })}>
                    {t("employees.contracts.endAction")}
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        );
      })}
      {mode && (
        <ContractDialog
          mode={mode}
          basePath={basePath}
          onClose={() => setMode(null)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["contracts", basePath] })}
        />
      )}
    </div>
  );
}

function ContractDialog({ mode, basePath, onClose, onDone }: { mode: Mode; basePath: string; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const startDefault = mode.kind === "renew" && mode.from.endDate ? addDays(mode.from.endDate, 1) : today();
  const [type, setType] = useState<string>(mode.kind === "renew" ? mode.from.type : "fixed_term");
  const [startDate, setStartDate] = useState(startDefault);
  const [endDate, setEndDate] = useState(mode.kind === "end" ? today() : addYears(startDefault, 1));
  const [probation, setProbation] = useState(mode.kind === "new");
  const [probationEnd, setProbationEnd] = useState(addDays(startDefault, 89));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (mode.kind === "end") return apiJson(`${basePath}/${mode.contract.id}/end`, { method: "POST", ...jsonBody({ endDate, ...(notes.trim() ? { notes: notes.trim() } : {}) }) });
      const body = {
        type,
        startDate,
        endDate: type === "open_ended" ? null : endDate,
        probationEndDate: probation ? probationEnd : null,
        notes: notes.trim() || null,
      };
      return mode.kind === "renew"
        ? apiJson(`${basePath}/${mode.from.id}/renew`, { method: "POST", ...jsonBody(body) })
        : apiJson(basePath, { method: "POST", ...jsonBody(body) });
    },
    onSuccess: () => {
      toast.success(t("common.changesSaved"));
      onDone();
      onClose();
    },
    onError: (e) => setError(t((e instanceof ApiError && ERRORS[e.code]) || "employees.contracts.errors.failed")),
  });

  const datesOk = mode.kind === "end" ? endDate >= mode.contract.startDate : (type === "open_ended" || endDate >= startDate) && (!probation || probationEnd >= startDate);
  const title = mode.kind === "new" ? t("employees.contracts.add") : mode.kind === "renew" ? t("employees.contracts.renewTitle") : t("employees.contracts.endTitle");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode.kind !== "new" && (
            <DialogDescription>{mode.kind === "renew" ? t("employees.contracts.renewHint") : t("employees.contracts.endHint")}</DialogDescription>
          )}
        </DialogHeader>
        <form
          id="contract-form"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (datesOk) save.mutate();
          }}
        >
          {mode.kind === "end" ? (
            <Field label={t("employees.contracts.lastDay")} htmlFor="ct-end" required error={datesOk ? undefined : t("employees.contracts.errors.invalidDates")}>
              <DatePicker id="ct-end" value={endDate} onChange={(v) => setEndDate(v)} />
            </Field>
          ) : (
            <>
              <Field label={t("employees.contracts.type")} htmlFor="ct-type" required>
                <NativeSelect id="ct-type" value={type} onChange={(e) => setType(e.target.value)}>
                  {CONTRACT_TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`employees.contracts.types.${x}`)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("employees.contracts.start")} htmlFor="ct-start" required>
                <DatePicker
                  id="ct-start"
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    if (v) {
                      setEndDate(addYears(v, 1));
                      setProbationEnd(addDays(v, 89));
                    }
                  }}
                />
              </Field>
              {type === "fixed_term" && (
                <Field label={t("employees.contracts.end")} htmlFor="ct-endd" required hint={t("employees.contracts.endHintDefault")}>
                  <DatePicker id="ct-endd" min={startDate} value={endDate} onChange={(v) => setEndDate(v)} />
                </Field>
              )}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-body">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={probation} onChange={(e) => setProbation(e.target.checked)} />
                  {t("employees.contracts.hasProbation")}
                </label>
                {probation && (
                  <div className="max-w-xs">
                    <Field label={t("employees.contracts.probationEnd")} htmlFor="ct-prob" hint={t("employees.contracts.probationHint")}>
                      <DatePicker id="ct-prob" min={startDate} value={probationEnd} onChange={(v) => setProbationEnd(v)} />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Field label={t("employees.contracts.notes")} htmlFor="ct-notes">
              <Textarea id="ct-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          {!datesOk && mode.kind !== "end" && <Alert className="sm:col-span-2">{t("employees.contracts.errors.invalidDates")}</Alert>}
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="contract-form" variant={mode.kind === "end" ? "danger" : "primary"} loading={save.isPending} disabled={!datesOk}>
            {mode.kind === "end" ? t("employees.contracts.endAction") : t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
