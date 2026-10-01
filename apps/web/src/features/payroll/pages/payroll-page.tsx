import { PERMISSIONS, type PayrollItemView, type PayrollRunDetail, type PayrollRunView, type PayrollWarning } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Calculator, Check, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, NativeSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { ApiError, apiFetch, apiJson, jsonBody, parseError } from "@/lib/api";
import { todayInRiyadh } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import { Payslip, useMonthName } from "../payslip";

const STATUS_TONE: Record<PayrollRunView["status"], Tone> = { calculated: "warning", approved: "success", exported: "info" };
const ERRORS = ["run_exists", "future_period", "four_eyes", "stale", "locked", "not_calculated", "not_approved", "company_only", "month_not_over"];

function usePayrollError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    const key = e instanceof ApiError ? ERRORS.find((k) => e.code === `payroll.${k}`) : undefined;
    return key ? t(`payroll.errors.${key}`) : t("payroll.errors.failed");
  };
}

/** POST that returns a file (the export changes the run's state, so it isn't a GET). */
async function downloadBlob(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path, { method: "POST" });
  if (!response.ok) throw await parseError(response);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const shiftMonth = (period: string, n: number): string => {
  const [y = 0, m = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

function Money({ h }: { h: string }): React.JSX.Element {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatHalalas(h)}
    </bdi>
  );
}

function CalculateDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: string[] }): React.JSX.Element {
  const { t } = useTranslation();
  const monthName = useMonthName();
  const errorText = usePayrollError();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const current = todayInRiyadh().slice(0, 7);
  const options = [current, shiftMonth(current, -1), shiftMonth(current, -2)].filter((p) => !existing.includes(p));
  const [period, setPeriod] = useState(options[0] ?? "");
  // One key per dialog opening: a double click or a retried request creates one run.
  const [key] = useState(() => crypto.randomUUID());
  const create = useMutation({
    mutationFn: () => apiJson<PayrollRunDetail>("/api/v1/payroll-runs", { method: "POST", headers: { "Idempotency-Key": key }, ...jsonBody({ period }) }),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ["payroll"] });
      onClose();
      navigate(`/payroll/${run.id}`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("payroll.calculate")}</DialogTitle>
          <DialogDescription>{t("payroll.calculateHint")}</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <Alert tone="info">{t("payroll.allCalculated")}</Alert>
        ) : (
          <Field label={t("payroll.month")} htmlFor="pr-period" required>
            <NativeSelect id="pr-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {options.map((p) => (
                <option key={p} value={p}>
                  {monthName(p)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {create.isError && <Alert>{errorText(create.error)}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button icon={<Calculator />} loading={create.isPending} disabled={!period} onClick={() => create.mutate()}>
            {t("payroll.calculate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** الرواتب: one run per month — calculate, review, approve (someone else), export to Techno Link. */
export function PayrollPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const monthName = useMonthName();
  const runs = useQuery({ queryKey: ["payroll", "runs"], queryFn: () => apiJson<PayrollRunView[]>("/api/v1/payroll-runs") });
  const [calculating, setCalculating] = useState(false);
  return (
    <div>
      <PageHeader
        title={t("payroll.title")}
        description={t("payroll.description")}
        actions={
          can(PERMISSIONS.PAYROLL_RUN) ? (
            <Button icon={<Calculator />} onClick={() => setCalculating(true)}>
              {t("payroll.calculate")}
            </Button>
          ) : undefined
        }
      />
      {runs.isLoading ? (
        <Skeleton className="h-40" />
      ) : runs.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : runs.data?.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("payroll.empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("payroll.month")}</TableHead>
              <TableHead>{t("payroll.statusLabel")}</TableHead>
              <TableHead className="text-end">{t("payroll.employees")}</TableHead>
              <TableHead className="text-end">{t("payroll.gross")}</TableHead>
              <TableHead className="text-end">{t("payroll.net")}</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {runs.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link className="underline-offset-2 hover:underline" to={`/payroll/${r.id}`}>
                    {monthName(r.period)}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={STATUS_TONE[r.status]}>{t(`payroll.status.${r.status}`)}</Badge>
                    {r.totals.warnings > 0 && r.status === "calculated" && <Badge tone="danger">{t("payroll.warningsCount", { count: r.totals.warnings })}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-end tabular-nums">{r.totals.employees}</TableCell>
                <TableCell className="text-end">
                  <Money h={r.totals.grossHalalas} />
                </TableCell>
                <TableCell className="text-end font-medium">
                  <Money h={r.totals.netHalalas} />
                </TableCell>
                <TableCell>
                  <Link to={`/payroll/${r.id}`} aria-label={t("payroll.open")} className="text-ink-muted hover:text-ink">
                    <ArrowRight className="size-4 rtl:rotate-180" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {calculating && <CalculateDialog open onClose={() => setCalculating(false)} existing={runs.data?.map((r) => r.period) ?? []} />}
    </div>
  );
}

function Stat({ label, h, strong }: { label: string; h: string; strong?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel className="p-4">
      <p className="text-meta text-ink-muted">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-page-title" : "text-section"}`}>
        <Money h={h} /> <span className="text-meta font-normal text-ink-muted">{t("employees.salary.sar")}</span>
      </p>
    </Panel>
  );
}

const itemDeductions = (i: PayrollItemView): string =>
  (BigInt(i.absenceHalalas) + BigInt(i.latenessHalalas) + BigInt(i.unpaidLeaveHalalas) + BigInt(i.tieredLeaveHalalas) + BigInt(i.deductionsHalalas)).toString();

/** One month's run: totals, warnings to look at, every employee's line; approve / export. */
export function PayrollRunPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const monthName = useMonthName();
  const errorText = usePayrollError();
  const queryClient = useQueryClient();
  const run = useQuery({ queryKey: ["payroll", "run", id], queryFn: () => apiJson<PayrollRunDetail>(`/api/v1/payroll-runs/${id}`) });
  const [viewing, setViewing] = useState<PayrollItemView | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const onDone = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["payroll"] });
  };
  const recalc = useMutation({
    mutationFn: () => apiJson(`/api/v1/payroll-runs/${id}/recalculate`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("payroll.recalculated"));
      await onDone();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const approve = useMutation({
    mutationFn: () => apiJson(`/api/v1/payroll-runs/${id}/approve`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("payroll.approvedToast"));
      setConfirming(false);
      await onDone();
    },
  });
  const [exporting, setExporting] = useState(false);

  if (run.isLoading) return <Skeleton className="h-64" />;
  if (run.isError || !run.data) return <Alert>{t("common.loadFailed")}</Alert>;
  const r = run.data;
  const warned = r.items.filter((i) => i.breakdown.warnings.length > 0);
  const rows = onlyWarnings ? warned : r.items;
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("payroll.runTitle", { month: monthName(r.period) })}
        description={r.status === "calculated" ? t("payroll.reviewHint") : t("payroll.lockedHint")}
        actions={
          <div className="flex flex-wrap gap-2">
            {r.canRecalculate && (
              <Button variant="secondary" icon={<RefreshCw />} loading={recalc.isPending} onClick={() => recalc.mutate()}>
                {t("payroll.recalculate")}
              </Button>
            )}
            {r.canApprove && (
              <Button
                icon={<Check />}
                onClick={() => {
                  approve.reset();
                  setConfirming(true);
                }}
              >
                {t("payroll.approve")}
              </Button>
            )}
            {r.canExport && (
              <Button
                variant="secondary"
                icon={<Download />}
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await downloadBlob(`/api/v1/payroll-runs/${r.id}/export`, `payroll-${r.period}.xlsx`);
                  } catch (e) {
                    toast.error(errorText(e));
                  }
                  setExporting(false);
                  await onDone();
                }}
              >
                {t("payroll.export")}
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[r.status]}>{t(`payroll.status.${r.status}`)}</Badge>
        <Link to="/payroll" className="text-meta text-ink-muted underline-offset-2 hover:underline">
          {t("payroll.allRuns")}
        </Link>
      </div>
      {r.status === "calculated" && todayInRiyadh() < r.approvableFrom && <Alert tone="info">{t("payroll.notOverYet", { date: r.approvableFrom })}</Alert>}
      {r.status === "calculated" && todayInRiyadh() >= r.approvableFrom && !r.canApprove && r.canRecalculate && (
        <Alert tone="info">{t("payroll.needsOtherApprover")}</Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("payroll.gross")} h={r.totals.grossHalalas} />
        <Stat label={t("payroll.additions")} h={r.totals.additionsHalalas} />
        <Stat label={t("payroll.deductions")} h={r.totals.deductionsHalalas} />
        <Stat label={t("payroll.gosiEmployer")} h={r.totals.gosiEmployerHalalas} />
        <Stat label={t("payroll.net")} h={r.totals.netHalalas} strong />
      </div>
      {warned.length > 0 && (
        <Alert tone="warning">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("payroll.warningsAlert", { count: warned.length })}</span>
            <Button size="sm" variant="ghost" onClick={() => setOnlyWarnings((v) => !v)}>
              {onlyWarnings ? t("payroll.showAll") : t("payroll.showWarnings")}
            </Button>
          </span>
        </Alert>
      )}
      {rows.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("payroll.noItems")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("payroll.employee")}</TableHead>
              <TableHead className="text-end">{t("payroll.paidDays")}</TableHead>
              <TableHead className="text-end">{t("payroll.gross")}</TableHead>
              <TableHead className="hidden text-end md:table-cell">{t("payroll.additions")}</TableHead>
              <TableHead className="hidden text-end md:table-cell">{t("payroll.deductions")}</TableHead>
              <TableHead className="hidden text-end lg:table-cell">{t("payroll.gosiEmployee")}</TableHead>
              <TableHead className="text-end">{t("payroll.net")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => setViewing(i)}>
                <TableCell>
                  <span className="block font-medium">{i.employee ? nameIn(i18n, i.employee) : "—"}</span>
                  <span className="flex flex-wrap items-center gap-1 text-meta text-ink-muted">
                    <bdi>{i.employee?.employeeNo}</bdi>
                    {i.breakdown.warnings.map((w: PayrollWarning) => (
                      <Badge key={w} tone="danger" className="gap-1">
                        <AlertTriangle className="size-3" aria-hidden />
                        {t(`payroll.warnings.${w}`)}
                      </Badge>
                    ))}
                  </span>
                </TableCell>
                <TableCell className="text-end tabular-nums">{i.paidDays}</TableCell>
                <TableCell className="text-end">
                  <Money h={i.grossHalalas} />
                </TableCell>
                <TableCell className="hidden text-end md:table-cell">
                  <Money h={i.additionsHalalas} />
                </TableCell>
                <TableCell className="hidden text-end md:table-cell">
                  <Money h={itemDeductions(i)} />
                </TableCell>
                <TableCell className="hidden text-end lg:table-cell">
                  <Money h={i.gosiEmployeeHalalas} />
                </TableCell>
                <TableCell className="text-end font-medium">
                  <Money h={i.netHalalas} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("payroll.payslip.titleShort")}</DialogTitle>
          </DialogHeader>
          {viewing && <Payslip item={viewing} />}
        </DialogContent>
      </Dialog>
      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payroll.confirmApprove", { month: monthName(r.period) })}</DialogTitle>
            <DialogDescription>{t("payroll.confirmApproveHint", { count: r.totals.employees, net: formatHalalas(r.totals.netHalalas) })}</DialogDescription>
          </DialogHeader>
          {warned.length > 0 && <Alert tone="warning">{t("payroll.warningsAlert", { count: warned.length })}</Alert>}
          {approve.isError && <Alert>{errorText(approve.error)}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button icon={<Check />} loading={approve.isPending} onClick={() => approve.mutate()}>
              {t("payroll.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** قسائم راتبي: the employee's approved payslips, newest first. */
export function MyPayslipsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const monthName = useMonthName();
  const list = useQuery({ queryKey: ["payroll", "mine"], queryFn: () => apiJson<PayrollItemView[]>("/api/v1/me/payslips") });
  const [selected, setSelected] = useState<string | null>(null);
  const current = list.data?.find((i) => i.id === selected) ?? list.data?.[0];
  return (
    <div className="space-y-4">
      <PageHeader title={t("payroll.mine.title")} description={t("payroll.mine.description")} />
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <Alert>{t("common.loadFailed")}</Alert>
      ) : !current ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("payroll.mine.empty")} />
        </div>
      ) : (
        <>
          {list.data && list.data.length > 1 && (
            <div className="no-print max-w-xs">
              <Field label={t("payroll.month")} htmlFor="ps-month">
                <NativeSelect id="ps-month" value={current.id} onChange={(e) => setSelected(e.target.value)}>
                  {list.data.map((i) => (
                    <option key={i.id} value={i.id}>
                      {monthName(i.period)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          )}
          <Payslip item={current} />
        </>
      )}
    </div>
  );
}
