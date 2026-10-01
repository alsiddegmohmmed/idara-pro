import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { DecisionBar } from "@/components/decision-bar";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { downloadFile } from "@/features/employees/documents";
import { nameIn } from "@/features/employees/employee-name";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatDateRange, todayInRiyadh } from "@/lib/dates";
import { useOpenOnNewParam } from "@/lib/use-new-param";
import {
  useLeaveBalances,
  useLeavePreview,
  useLeaveRequests,
  useLeaveTypes,
  useMyBalances,
  useMyLeaveRequests,
  type Balance,
  type EmployeeRef,
  type LeaveRequest,
  type LeaveType,
} from "../api";
import { LeaveBadge, useTypeName } from "../leave-badge";
import { DateRangePicker, MonthPicker } from "@/components/ui/date-picker";
import { useFormCheck } from "@/lib/use-form-check";

function useLeaveError(): (e: unknown) => string {
  const { t } = useTranslation();
  return (e) => {
    if (!(e instanceof ApiError)) return t("leave.errors.failed");
    if (e.code === "leave.insufficient_balance") return t("leave.errors.insufficient_balance", { available: String(e.details.available ?? 0) });
    const known = ["overlap", "cross_year", "no_working_days", "not_pending", "own_request", "out_of_scope", "employee_inactive", "attachment_required"];
    if (e.code === "leave.attachment.invalid_file_type") return t("leave.attachment.invalidType");
    if (e.code === "leave.attachment.too_large") return t("leave.attachment.tooLarge");
    const key = known.find((k) => e.code === `leave.${k}`);
    if (e.code === "leave.entitlement.forbidden") return t("leave.errors.entitlement_forbidden");
    return key ? t(`leave.errors.${key}`) : t("leave.errors.failed");
  };
}

function Dates({ r }: { r: Pick<LeaveRequest, "startDate" | "endDate"> }): React.JSX.Element {
  return <bdi dir="ltr" className="tabular-nums">{r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}</bdi>;
}

function EmployeeCell({ e }: { e: EmployeeRef | null }): React.JSX.Element {
  const { i18n } = useTranslation();
  if (!e) return <>—</>;
  return (
    <span className="flex items-center gap-3">
      <Avatar name={e.fullNameAr} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{nameIn(i18n, e)}</span>
        <span className="block text-meta text-ink-muted">
          <bdi>{e.employeeNo}</bdi>
        </span>
      </span>
    </span>
  );
}

function uploadAttachment(id: string, file: File): Promise<unknown> {
  const body = new FormData();
  body.append("file", file);
  return apiJson(`/api/v1/leave/requests/${id}/attachment`, { method: "POST", body });
}

/** "Sick pay: 30 days full pay, then 60 days at 75%, then 30 days unpaid." */
function usePayTiersText(): (tiers: LeaveType["payTiers"]) => string | null {
  const { t } = useTranslation();
  return (tiers) =>
    tiers && tiers.length > 0
      ? tiers.map((tier) => (tier.percent === 0 ? t("leave.tiers.unpaid", { count: tier.days }) : t("leave.tiers.paid", { count: tier.days, percent: tier.percent }))).join(t("leave.tiers.then"))
      : null;
}

/** The supporting document on a request: download it, or (the requester, while pending) attach one. */
function AttachmentCell({ r, mine }: { r: LeaveRequest; mine: boolean }): React.JSX.Element | null {
  const { t } = useTranslation();
  const errorText = useLeaveError();
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(r.id, file),
    onSuccess: () => {
      toast.success(t("leave.attachment.saved"));
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const path = mine ? `/api/v1/leave/me/requests/${r.id}/attachment` : `/api/v1/leave/requests/${r.id}/attachment`;
  if (r.attachment) {
    const name = r.attachment.name;
    return (
      <button type="button" className="inline-flex items-center gap-1 text-meta text-primary underline-offset-2 hover:underline" onClick={() => void downloadFile(path, name)}>
        <Paperclip className="size-3.5" aria-hidden />
        <span className="max-w-40 truncate">{name}</span>
      </button>
    );
  }
  if (!r.leaveType.requiresAttachment) return null;
  if (!mine || r.status !== "pending") return <span className="text-meta text-warning">{t("leave.attachment.missing")}</span>;
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-primary">
      <Paperclip className="size-3.5" aria-hidden />
      {upload.isPending ? t("common.loading") : t("leave.attachment.add")}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// ---------------- my leave ----------------

function BalanceCard({ b }: { b: Balance }): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  return (
    <Panel className="p-5">
      <p className="text-meta font-medium text-ink-muted">{typeName(b.leaveType)}</p>
      {b.availableDays !== null ? (
        <>
          <p className="mt-1 text-page-title tabular-nums">
            {b.availableDays} <span className="text-body font-normal text-ink-muted">/ {b.entitledDays}</span>
          </p>
          <p className="text-meta text-ink-muted">
            {t("leave.balance.available")}
            {b.pendingDays > 0 && ` · ${t("leave.balance.pending", { days: b.pendingDays })}`}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-page-title tabular-nums">{b.usedDays}</p>
          <p className="text-meta text-ink-muted">{t("leave.balance.usedThisYear")}</p>
        </>
      )}
    </Panel>
  );
}

function RequestLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const errorText = useLeaveError();
  const queryClient = useQueryClient();
  const types = useLeaveTypes();
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const preview = useLeavePreview(typeId, start, end);
  const tiersText = usePayTiersText();
  const selected = types.data?.find((ty) => ty.id === typeId);

  useEffect(() => {
    if (open) {
      setTypeId(types.data?.[0]?.id ?? "");
      setStart(todayInRiyadh());
      setEnd(todayInRiyadh());
      setReason("");
      setFile(null);
    }
  }, [open, types.data]);

  const submit = useMutation({
    mutationFn: async () => {
      const created = await apiJson<LeaveRequest>("/api/v1/leave/requests", {
        method: "POST",
        ...jsonBody({ leaveTypeId: typeId, startDate: start, endDate: end, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      // The request is saved even if the upload fails — the employee can attach again from the list.
      if (file && selected?.requiresAttachment) await uploadAttachment(created.id, file).catch(() => toast.error(t("leave.attachment.failedLater")));
    },
    onSuccess: () => {
      toast.success(t("leave.request.sent"));
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
      onClose();
    },
  });

  const after =
    preview.data && preview.data.balance.availableDays !== null ? preview.data.balance.availableDays - preview.data.days : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          submit.reset();
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
            submit.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("leave.request.title")}</DialogTitle>
            <DialogDescription>{t("leave.request.description")}</DialogDescription>
          </DialogHeader>
          <Field label={t("leave.type")} htmlFor="l-type">
            <NativeSelect id="l-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.data?.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {typeName(ty)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("leave.dates")} htmlFor="l-dates">
            <DateRangePicker
              id="l-dates"
              from={start}
              to={end}
              onChange={(r) => {
                setStart(r.from);
                setEnd(r.to);
              }}
            />
          </Field>
          {selected?.payTiers && <p className="text-meta text-ink-muted">{t("leave.tiers.label", { tiers: tiersText(selected.payTiers) })}</p>}
          <Field label={t("leave.reason")} htmlFor="l-reason">
            <Textarea id="l-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {selected?.requiresAttachment && (
            <Field label={t("leave.attachment.label")} htmlFor="l-file" hint={t("leave.attachment.hint")}>
              <Input id="l-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          )}
          {preview.data && (
            <Alert tone={after !== null && after < 0 ? "danger" : "info"}>
              {t("leave.request.days", { count: preview.data.days })}
              {after !== null && ` · ${t("leave.request.remaining", { days: after })}`}
            </Alert>
          )}
          {preview.isError && <Alert>{errorText(preview.error)}</Alert>}
          {submit.isError && <Alert>{errorText(submit.error)}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" loading={submit.isPending} disabled={!preview.data || preview.data.days === 0}>
              {t("leave.request.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MyLeaveTab(): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const errorText = useLeaveError();
  const queryClient = useQueryClient();
  const balances = useMyBalances();
  const requests = useMyLeaveRequests();
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  useOpenOnNewParam(() => setRequesting(true));
  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/leave/requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("leave.request.cancelled"));
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button icon={<Plus />} onClick={() => setRequesting(true)} className="w-full sm:w-auto">
          {t("leave.request.title")}
        </Button>
      </div>
      {balances.isLoading && <Skeleton className="h-24" />}
      {balances.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {balances.data.map((b) => (
            <BalanceCard key={b.leaveType.id} b={b} />
          ))}
        </div>
      )}
      <section className="space-y-3">
        <h2 className="text-section">{t("leave.myRequests")}</h2>
        {requests.data && requests.data.length === 0 && (
          <div className="rounded-panel border border-line bg-surface">
            <EmptyState
              message={t("leave.noRequests")}
              action={
                <Button icon={<Plus />} onClick={() => setRequesting(true)}>
                  {t("leave.request.title")}
                </Button>
              }
            />
          </div>
        )}
        {requests.data && requests.data.length > 0 && (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>{t("leave.type")}</TableHead>
                <TableHead>{t("leave.dates")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("leave.days")}</TableHead>
                <TableHead>{t("employees.fields.status")}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {requests.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{typeName(r.leaveType)}</TableCell>
                  <TableCell>
                    <Dates r={r} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.days}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <LeaveBadge status={r.status} />
                      {r.status === "rejected" && r.decisionNote && (
                        <span className="text-meta text-danger">{t("notifications.reason", { reason: r.decisionNote })}</span>
                      )}
                      <AttachmentCell r={r} mine />
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => setCancelling(r)}>
                        {t("leave.request.cancel")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <RequestLeaveDialog open={requesting} onClose={() => setRequesting(false)} />
      <Dialog open={cancelling !== null} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cancelling && t("leave.request.cancelTitle", { type: typeName(cancelling.leaveType) })}</DialogTitle>
            <DialogDescription>
              {cancelling && <bdi dir="ltr">{formatDateRange(cancelling.startDate, cancelling.endDate)}</bdi>} · {t("leave.request.cancelHint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("leave.request.keep")}</Button>
            </DialogClose>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling.id)}>
              {t("leave.request.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- approvals ----------------

function ApprovalsTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const typeName = useTypeName();
  const errorText = useLeaveError();
  const queryClient = useQueryClient();
  const pending = useLeaveRequests({ status: "pending" });
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [note, setNote] = useState("");
  const check = useFormCheck();
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ["leave"] });

  const named = (r: LeaveRequest): string =>
    r.employee ? t("decision.approvedNamed", { request: typeName(r.leaveType), name: nameIn(i18n, r.employee) }) : t("leave.approved");
  const approve = useMutation({
    mutationFn: (r: LeaveRequest) => apiJson(`/api/v1/leave/requests/${r.id}/approve`, { method: "POST", ...jsonBody({}) }),
    onSuccess: (_d, r) => {
      toast.success(named(r));
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const reject = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/leave/requests/${id}/reject`, { method: "POST", ...jsonBody({ note: note.trim() }) }),
    onSuccess: () => {
      toast.success(t("leave.rejected"));
      setRejecting(null);
      refresh();
    },
  });

  const rows = pending.data ?? [];
  return (
    <div className="space-y-4">
      {pending.isLoading && <TableSkeleton />}
      {pending.data && rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("leave.noPending")} />
        </div>
      )}
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("leave.type")}</TableHead>
              <TableHead>{t("leave.dates")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("leave.days")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("leave.reason")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <EmployeeCell e={r.employee} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {typeName(r.leaveType)}
                    <AttachmentCell r={r} mine={false} />
                  </div>
                </TableCell>
                <TableCell>
                  <Dates r={r} />
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.days}</TableCell>
                <TableCell className="hidden max-w-60 truncate lg:table-cell">{r.reason ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {r.canDecide ? (
                      <DecisionBar
                        approving={approve.isPending && approve.variables?.id === r.id}
                        approveDisabledReason={r.leaveType.requiresAttachment && !r.attachment ? t("leave.errors.attachment_required") : undefined}
                        onApprove={() => approve.mutate(r)}
                        onReject={() => {
                          setNote("");
                          check.reset();
                          reject.reset();
                          setRejecting(r);
                        }}
                      />
                    ) : (
                      <span className="text-meta text-ink-muted">{t("leave.cannotDecide")}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <form onBlur={check.onBlur}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!check.submit(note.trim().length >= 3)) return;
              if (rejecting) reject.mutate(rejecting.id);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {rejecting?.employee && t("leave.rejectTitle", { name: nameIn(i18n, rejecting.employee), type: typeName(rejecting.leaveType) })}
              </DialogTitle>
              <DialogDescription>{t("leave.rejectBody")}</DialogDescription>
            </DialogHeader>
            <Field label={t("review.reason")} htmlFor="lr-note" error={check.show("lr-note") && note.trim().length < 3 ? t("review.reasonRequired") : undefined}>
              <Textarea id="lr-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {reject.isError && <Alert>{errorText(reject.error)}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" variant="danger" loading={reject.isPending}>
                {t("review.confirmReject")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- calendar ----------------

const monthRange = (month: string): { from: string; to: string } => {
  const [y = 0, m = 1] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
};

function CalendarTab(): React.JSX.Element {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const [month, setMonth] = useState(() => todayInRiyadh().slice(0, 7));
  const range = monthRange(month);
  const requests = useLeaveRequests(range);
  const rows = (requests.data ?? []).filter((r) => r.status === "approved" || r.status === "pending");
  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={setMonth} />
      {requests.isLoading && <TableSkeleton />}
      {requests.data && rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("leave.noLeaveThisMonth")} />
        </div>
      )}
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("leave.type")}</TableHead>
              <TableHead>{t("leave.dates")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("leave.days")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {[...rows].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <EmployeeCell e={r.employee} />
                </TableCell>
                <TableCell>{typeName(r.leaveType)}</TableCell>
                <TableCell>
                  <Dates r={r} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">{r.days}</TableCell>
                <TableCell>
                  <LeaveBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------- balances ----------------

function BalancesTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const typeName = useTypeName();
  const { can } = useAuth();
  const errorText = useLeaveError();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => Number(todayInRiyadh().slice(0, 4)));
  const data = useLeaveBalances(year);
  const [editing, setEditing] = useState<{ employee: EmployeeRef; balance: Balance } | null>(null);
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  // Changing entitlements is HR's (leave:approve at company scope) — managers can't, so they don't see it.
  const canEdit = can(PERMISSIONS.LEAVE_MANAGE);

  const save = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/leave/balances", {
        method: "PUT",
        ...jsonBody({
          employeeId: editing?.employee.id,
          leaveTypeId: editing?.balance.leaveType.id,
          year,
          entitledDays: Number(days),
          reason: reason.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success(t("leave.entitlement.saved"));
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
  });

  const rows = data.data?.rows ?? [];
  const valid = /^\d{1,3}$/.test(days) && reason.trim().length >= 3;
  return (
    <div className="space-y-4">
      <NativeSelect value={String(year)} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("leave.year")} className="w-auto">
        {[year - 1, year, year + 1].map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </NativeSelect>
      {data.isLoading && <TableSkeleton />}
      {data.data && rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("attendance.noEmployees")} />
        </div>
      )}
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("leave.type")}</TableHead>
              <TableHead>{t("leave.balance.entitled")}</TableHead>
              <TableHead>{t("leave.balance.used")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("leave.balance.pendingShort")}</TableHead>
              <TableHead>{t("leave.balance.available")}</TableHead>
              {canEdit && (
                <TableHead className="w-24">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              )}
            </tr>
          </TableHeader>
          <TableBody>
            {rows.flatMap((row) =>
              row.balances.map((b) => (
                <TableRow key={`${row.employee.id}-${b.leaveType.id}`}>
                  <TableCell>
                    <EmployeeCell e={row.employee} />
                  </TableCell>
                  <TableCell>{typeName(b.leaveType)}</TableCell>
                  <TableCell>{b.entitledDays}</TableCell>
                  <TableCell>{b.usedDays}</TableCell>
                  <TableCell className="hidden sm:table-cell">{b.pendingDays}</TableCell>
                  <TableCell className="font-medium">{b.availableDays}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil />}
                        onClick={() => {
                          setDays(String(b.entitledDays ?? ""));
                          setReason("");
                          save.reset();
                          setEditing({ employee: row.employee, balance: b });
                        }}
                      >
                        {t("common.edit")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) save.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing && t("leave.entitlement.title", { name: nameIn(i18n, editing.employee), year })}</DialogTitle>
              <DialogDescription>{t("leave.entitlement.description")}</DialogDescription>
            </DialogHeader>
            <Field label={t("leave.balance.entitled")} htmlFor="le-days">
              <Input id="le-days" dir="ltr" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Field label={t("leave.entitlement.reason")} htmlFor="le-reason">
              <Textarea id="le-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {save.isError && <Alert>{errorText(save.error)}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" loading={save.isPending} disabled={!valid}>
                {t("common.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** الإجازات: tabs appear by permission (request / approve / read). */
export function LeavePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { hasEmployee, isLoading } = useMyEmployee();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: "mine", show: can(PERMISSIONS.LEAVE_REQUEST) && hasEmployee },
    { id: "approvals", show: can(PERMISSIONS.LEAVE_APPROVE) && can(PERMISSIONS.LEAVE_READ) },
    { id: "calendar", show: can(PERMISSIONS.LEAVE_READ) },
    { id: "balances", show: can(PERMISSIONS.LEAVE_READ) },
  ].filter((x) => x.show);
  const tab = tabs.find((x) => x.id === params.get("tab"))?.id ?? tabs[0]?.id ?? "";
  const shows = (id: string): boolean => tabs.some((x) => x.id === id);
  return (
    <div>
      <PageHeader title={t("leave.title")} description={t("leave.description")} />
      {isLoading && <TableSkeleton />}
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
                {t(`leave.tabs.${x.id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {shows("mine") && (
          <TabsContent value="mine">
            <MyLeaveTab />
          </TabsContent>
        )}
        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="balances">
          <BalancesTab />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
