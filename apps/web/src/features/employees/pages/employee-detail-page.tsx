import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RecordSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatHalalas, sarToHalalas } from "@/lib/money";
import type { Employee, EmployeeDocument, SalaryComponent } from "@/lib/types";
import { countryName } from "@/lib/countries";
import { ltr } from "@/lib/dates";
import { usePageCrumb } from "@/app/shell/crumb";
import { useEmployee, useEmployees, useRefs } from "../api";
import { ContactsPanel } from "../contacts-panel";
import { ContractsTab } from "../contracts-tab";
import { InsuranceTab } from "../insurance-tab";
import { DocumentPreview } from "../document-preview";
import { DocumentsTable, DocumentUploadForm } from "../documents";
import { nameIn } from "../employee-name";
import { Fact, MaskedValue, RecordHeader } from "../record-header";
import { ProposeWarningButton, WarningsList } from "@/features/discipline/warnings";
import { DatePicker } from "@/components/ui/date-picker";

const COMPONENT_TYPES = ["basic", "housing", "transport", "other"] as const;
const TABS = ["job", "contracts", "insurance", "salary", "documents", "warnings"] as const;

const ACCESS_ERRORS: Record<string, string> = {
  "employees.access.own_account": "employees.access.ownAccount",
  "employees.access.employee_inactive": "employees.access.employeeInactive",
  "employees.access.nothing_to_restore": "employees.access.nothingToRestore",
  "employees.access.no_account": "employees.access.noAccount",
};

/** Restores a deactivated employee's login: needs employees:manage-access (server-enforced; hidden here without it). */
function AccessPanel({ employeeId, linked, notRestored }: { employeeId: string; linked: boolean; notRestored: boolean }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const restore = useMutation({
    mutationFn: () => apiJson(`/api/v1/employees/${employeeId}/restore-access`, { method: "POST" }),
    onSuccess: () => toast.success(t("employees.access.restored")),
    onError: (e: Error) => setError(t((e instanceof ApiError && ACCESS_ERRORS[e.code]) || "employees.access.failed")),
  });

  // Shown only right after reactivating an employee whose login stayed off; otherwise the action lives in
  // the record header's ⋯ menu (it is rarely needed and confusing on a healthy record).
  if (!linked || !notRestored) return null;
  const allowed = can(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS);
  return (
    <Panel>
      <PanelHeader title={t("employees.access.title")} />
      <div className="space-y-4">
        {notRestored && <Alert tone="warning">{t("employees.access.notRestored")}</Alert>}
        {allowed ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="flex-1 text-body text-ink-muted">{t("employees.access.hint")}</p>
            <Button
              variant="secondary"
              loading={restore.isPending}
              onClick={() => {
                setError(null);
                restore.mutate();
              }}
            >
              {t("employees.access.restore")}
            </Button>
          </div>
        ) : (
          <p className="text-body text-ink-muted">{t("employees.access.needsPermission")}</p>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Panel>
  );
}

/** ⋯ next to "تعديل": secondary record actions (ui-spec §7.1) — today the rare "restore access". */
function RecordMenu({ employee }: { employee: Employee }): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restore = useMutation({
    mutationFn: () => apiJson(`/api/v1/employees/${employee.id}/restore-access`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("employees.access.restored"));
      setConfirming(false);
    },
    onError: (e: Error) => setError(t((e instanceof ApiError && ACCESS_ERRORS[e.code]) || "employees.access.failed")),
  });
  const canRestore = Boolean(employee.userId) && can(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS);
  if (!canRestore) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label={t("employees.moreActions", { name: nameIn(i18n, employee) })}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            <KeyRound aria-hidden="true" />
            {t("employees.access.restore")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        title={t("employees.access.confirmTitle", { name: nameIn(i18n, employee) })}
        description={t("employees.access.hint")}
        confirmLabel={t("employees.access.restore")}
        pending={restore.isPending}
        error={error}
        onConfirm={() => restore.mutate()}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

function InvitePanel({ employeeId, linked }: { employeeId: string; linked: boolean }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () => apiJson(`/api/v1/employees/${employeeId}/invite`, { method: "POST", ...jsonBody({ email }) }),
    onSuccess: () => toast.success(t("employees.invite.sent", { email })),
    onError: (e: Error) => {
      const code = e instanceof ApiError ? e.code : "";
      setError(
        code === "auth.invitation.email_in_use" ? t("employees.invite.emailInUse")
        : code === "employees.already_linked" ? t("employees.invite.alreadyLinked")
        : code === "employees.inactive" ? t("employees.invite.inactive")
        : t("employees.invite.failed"),
      );
    },
  });

  if (!can(PERMISSIONS.EMPLOYEES_INVITE) || linked) return null;
  return (
    <Panel>
      <PanelHeader title={t("employees.invite.title")} />
      <form
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          invite.mutate();
        }}
      >
        <div className="min-w-64 flex-1">
          <Field label={t("employees.invite.email")} htmlFor="invite-email" hint={t("employees.invite.hint")} error={error ?? undefined}>
            <Input id="invite-email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" loading={invite.isPending} className="sm:mt-[26px]">
          {t("employees.invite.send")}
        </Button>
      </form>
    </Panel>
  );
}

function JobDetailsTab({ e, notRestored }: { e: Employee; notRestored: boolean }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can, claims } = useAuth();
  const [showEmpty, setShowEmpty] = useState(false);
  // Filled fields first; empty ones stay out of the way behind "أكمل البيانات (N)" (no wall of dashes).
  const facts: Array<{ key: string; label: string; value: React.ReactNode }> = [
    { key: "fullNameAr", label: t("employees.fields.fullNameAr"), value: e.fullNameAr },
    { key: "fullNameEn", label: t("employees.fields.fullNameEn"), value: e.fullNameEn && <bdi>{e.fullNameEn}</bdi> },
    { key: "nationality", label: t("employees.fields.nationality"), value: countryName(e.nationality, i18n.language) },
    { key: "gender", label: t("employees.fields.gender"), value: e.gender && t(`employees.gender.${e.gender}`) },
    { key: "birthDate", label: t("employees.fields.birthDate"), value: e.birthDate && <bdi className="tabular-nums">{e.birthDate.slice(0, 10)}</bdi> },
    { key: "maritalStatus", label: t("employees.fields.maritalStatus"), value: e.maritalStatus && t(`employees.marital.${e.maritalStatus}`) },
    { key: "phone", label: t("employees.fields.phone"), value: e.phone && <bdi dir="ltr">{e.phone}</bdi> },
    { key: "additionalPhone", label: t("employees.fields.additionalPhone"), value: e.additionalPhone && <bdi dir="ltr">{e.additionalPhone}</bdi> },
    { key: "personalEmail", label: t("employees.fields.personalEmail"), value: e.personalEmail && <bdi>{e.personalEmail}</bdi> },
    { key: "address", label: t("employees.fields.address"), value: e.address },
    { key: "iban", label: t("employees.fields.iban"), value: e.iban && <bdi className="tabular-nums">{e.iban}</bdi> },
    { key: "endDate", label: t("employees.fields.endDate"), value: e.endDate && <bdi>{e.endDate.slice(0, 10)}</bdi> },
  ];
  const filled = facts.filter((f) => Boolean(f.value));
  const empty = facts.filter((f) => !f.value);
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title={t("employees.sections.personal")} />
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {(showEmpty ? facts : filled).map((f) => (
            <Fact key={f.key} label={f.label}>
              {f.value || undefined}
            </Fact>
          ))}
        </dl>
        {empty.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowEmpty((v) => !v)}>
              {showEmpty ? t("employees.hideEmpty") : t("employees.showEmpty", { count: empty.length })}
            </Button>
            {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
              <Button variant="secondary" size="sm" asChild icon={<Pencil />}>
                <Link to={`/employees/${e.id}/edit?focus=${empty[0]?.key ?? ""}`}>{t("employees.completeData", { count: empty.length })}</Link>
              </Button>
            )}
          </div>
        )}
        {e.ibanReviewStatus === "pending_review" && (
          <Alert tone="warning" className="mt-4">
            <Link to="/review-queue" className="underline underline-offset-2">
              {t("employees.ibanWaiting")}
            </Link>
          </Alert>
        )}
      </Panel>
      {can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE) && (
        <ContactsPanel
          basePath={`/api/v1/employees/${e.id}/contacts`}
          canEdit={can(PERMISSIONS.EMPLOYEES_UPDATE) && e.userId !== claims?.sub}
        />
      )}
      <InvitePanel employeeId={e.id} linked={Boolean(e.userId)} />
      <AccessPanel employeeId={e.id} linked={Boolean(e.userId)} notRestored={notRestored} />
    </div>
  );
}

function SalaryTab({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const key = ["salary", employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => apiJson<SalaryComponent[]>(`/api/v1/employees/${employeeId}/salary-components`) });
  const [form, setForm] = useState({ type: "basic", amount: "", from: "", to: "" });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SalaryComponent | null>(null);
  // Match the API: changing salary components needs salary:manage.
  const canAdd = can(PERMISSIONS.SALARY_MANAGE);
  const canDelete = can(PERMISSIONS.SALARY_MANAGE);
  const add = useMutation({
    mutationFn: (amountHalalas: string) =>
      apiJson(`/api/v1/employees/${employeeId}/salary-components`, {
        method: "POST",
        ...jsonBody({ type: form.type, amountHalalas, effectiveFrom: form.from, ...(form.to ? { effectiveTo: form.to } : {}) }),
      }),
    onSuccess: () => {
      setForm({ type: "basic", amount: "", from: "", to: "" });
      toast.success(t("employees.salary.added"));
      return queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError && e.code === "employees.salary_component.overlapping_range"
          ? t("employees.salary.overlap")
          : t("employees.salary.failed"),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/salary-components/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("employees.salary.deleted"));
      setDeleting(null);
      return queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error(t("employees.salary.deleteFailed")),
  });

  return (
    <div className="space-y-6">
      {list.isLoading && <TableSkeleton />}
      {list.data && list.data.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("employees.salary.empty")} />
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.salary.type")}</TableHead>
              <TableHead>{t("employees.salary.period")}</TableHead>
              <TableHead className="text-end">{t("employees.salary.amountShort")}</TableHead>
              {canDelete && (
                <TableHead className="w-14">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              )}
            </tr>
          </TableHeader>
          <TableBody>
            {list.data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{t(`employees.salary.types.${c.type}`)}</TableCell>
                <TableCell>
                  {c.effectiveTo ? (
                    <bdi dir="ltr" className="tabular-nums">
                      {c.effectiveFrom.slice(0, 10)} → {c.effectiveTo.slice(0, 10)}
                    </bdi>
                  ) : (
                    t("employees.salary.since", { date: ltr(c.effectiveFrom.slice(0, 10)) })
                  )}
                </TableCell>
                <TableCell className="text-end font-medium">
                  <bdi>{formatHalalas(c.amountHalalas)}</bdi> {t("employees.salary.sar")}
                </TableCell>
                {canDelete && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger"
                      onClick={() => setDeleting(c)}
                      aria-label={t("employees.salary.deleteNamed", { type: t(`employees.salary.types.${c.type}`) })}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canAdd && (
        <Panel>
          <PanelHeader title={t("employees.salary.addTitle")} />
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const halalas = sarToHalalas(form.amount);
              if (!halalas) return setError(t("employees.salary.badAmount"));
              add.mutate(halalas);
            }}
          >
            <Field label={t("employees.salary.type")} htmlFor="c-type">
              <NativeSelect id="c-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {COMPONENT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`employees.salary.types.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("employees.salary.amount")} htmlFor="c-amount">
              <Input
                id="c-amount"
                dir="ltr"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label={t("employees.salary.from")} htmlFor="c-from">
              <DatePicker id="c-from" value={form.from} onChange={(v) => setForm({ ...form, from: v })} />
            </Field>
            <Field label={t("employees.salary.to")} htmlFor="c-to">
              <DatePicker id="c-to" value={form.to} onChange={(v) => setForm({ ...form, to: v })} />
            </Field>
            {error && <Alert className="sm:col-span-2 lg:col-span-4">{error}</Alert>}
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" loading={add.isPending}>
                {t("employees.salary.add")}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleting && t("employees.salary.deleteTitle", { type: t(`employees.salary.types.${deleting.type}`) })}
            </DialogTitle>
            <DialogDescription>{t("employees.salary.deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              {t("employees.salary.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentsTab({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const key = ["documents", employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => apiJson<EmployeeDocument[]>(`/api/v1/employees/${employeeId}/documents`) });
  const [preview, setPreview] = useState<EmployeeDocument | null>(null);
  const filePath = (d: EmployeeDocument): string => `/api/v1/employees/${employeeId}/documents/${d.id}/file`;
  return (
    <div className="space-y-6">
      {list.isLoading && <TableSkeleton />}
      {list.data && list.data.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("documents.empty")} />
        </div>
      )}
      {list.data && list.data.length > 0 && <DocumentsTable documents={list.data} filePath={filePath} onPreview={setPreview} />}
      {can(PERMISSIONS.EMPLOYEES_CREATE) && (
        <Panel>
          <PanelHeader title={t("documents.upload")} />
          <DocumentUploadForm
            path={`/api/v1/employees/${employeeId}/documents`}
            onDone={() => void queryClient.invalidateQueries({ queryKey: key })}
          />
        </Panel>
      )}
      <DocumentPreview
        path={preview ? filePath(preview) : null}
        title={preview ? `${t(`documents.types.${preview.type}`)} · ${preview.number}` : ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

export function EmployeeDetailPage(): React.JSX.Element {
  const { id } = useParams();
  // A new record is a fresh page: no tab, form or list state carries over from the previous employee.
  return <EmployeeRecord key={id} />;
}

function EmployeeRecord(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // The notice arrives via navigation state; keep it for this view, then clear it so a reload doesn't repeat it.
  const [notRestored] = useState(() => Boolean((location.state as { accessNotRestored?: boolean } | null)?.accessNotRestored));
  useEffect(() => {
    if (notRestored) navigate(location.pathname + location.search, { replace: true, state: null });
  }, [notRestored, navigate, location.pathname, location.search]);
  const { data: e, isLoading, isError } = useEmployee(id);
  const branches = useRefs("branches");
  const departments = useRefs("departments");
  const employees = useEmployees();
  const manager = useMemo(() => employees.data?.find((o) => o.id === e?.managerId), [employees.data, e?.managerId]);
  usePageCrumb(e ? nameIn(i18n, e) : null);

  const tabParam = params.get("tab");
  // Salaries are HR and Accounting only (ADR-0011 §7): no tab at all for anyone else.
  const canSeeSalary = can(PERMISSIONS.SALARY_READ);
  // Identity documents are personal data: only for employees:read-sensitive holders.
  const canSeeDocuments = can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE);
  const allowedTab: Record<(typeof TABS)[number], boolean> = {
    job: true,
    contracts: can(PERMISSIONS.CONTRACTS_READ),
    insurance: can(PERMISSIONS.INSURANCE_READ),
    salary: canSeeSalary,
    documents: canSeeDocuments,
    warnings: can(PERMISSIONS.WARNINGS_READ),
  };
  const tab = TABS.find((x) => x === tabParam && allowedTab[x]) ?? "job";

  if (isLoading) {
    return <RecordSkeleton />;
  }
  if (isError || !e || !id) return <Alert>{t("common.loadFailed")}</Alert>;

  const department = departments.data?.find((d) => d.id === e.departmentId)?.name;
  const branch = branches.data?.find((b) => b.id === e.branchId)?.name;

  return (
    <div className="space-y-6">
      <RecordHeader
        employee={e}
        actions={
          <>
            {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
              <Button variant="secondary" asChild icon={<Pencil />}>
                <Link to={`/employees/${e.id}/edit`}>{t("common.edit")}</Link>
              </Button>
            )}
            <RecordMenu employee={e} />
          </>
        }
        facts={
          <>
            <Fact label={t("employees.fields.employeeNo")}>
              <bdi>{e.employeeNo}</bdi>
            </Fact>
            <Fact label={t("employees.fields.nationalId")}>
              {/* Masked by the API for anyone without employees:read-sensitive (ADR-0011 §3); masked on screen too
                  until asked, so it isn't read over a shoulder. */}
              <MaskedValue value={e.nationalId} />
            </Fact>
            <Fact label={t("employees.fields.hireDate")}>
              <bdi className="tabular-nums">{e.hireDate.slice(0, 10)}</bdi>
            </Fact>
            <Fact label={t("employees.fields.department")}>{department}</Fact>
            <Fact label={t("employees.fields.branch")}>{branch}</Fact>
            <Fact label={t("employees.fields.manager")}>{manager && nameIn(i18n, manager)}</Fact>
            <Fact label={t("employees.fields.account")}>
              <Badge tone={e.userId ? "success" : "neutral"}>
                {e.userId ? t("employees.account.linked") : t("employees.account.none")}
              </Badge>
            </Fact>
          </>
        }
      />

      <Tabs
        preload
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === "job") next.delete("tab");
          else next.set("tab", value);
          setParams(next, { replace: true, preventScrollReset: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="job">{t("employees.tabs.job")}</TabsTrigger>
          {allowedTab.contracts && <TabsTrigger value="contracts">{t("employees.sections.contracts")}</TabsTrigger>}
          {allowedTab.insurance && <TabsTrigger value="insurance">{t("employees.sections.insurance")}</TabsTrigger>}
          {canSeeSalary && <TabsTrigger value="salary">{t("employees.tabs.salary")}</TabsTrigger>}
          {canSeeDocuments && <TabsTrigger value="documents">{t("employees.tabs.documents")}</TabsTrigger>}
          {allowedTab.warnings && <TabsTrigger value="warnings">{t("discipline.title")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="job">
          <JobDetailsTab e={e} notRestored={notRestored} />
        </TabsContent>
        {allowedTab.contracts && (
          <TabsContent value="contracts">
            <ContractsTab basePath={`/api/v1/employees/${e.id}/contracts`} />
          </TabsContent>
        )}
        {allowedTab.insurance && (
          <TabsContent value="insurance">
            <InsuranceTab basePath={`/api/v1/employees/${e.id}/insurance`} />
          </TabsContent>
        )}
        {canSeeSalary && (
          <TabsContent value="salary">
            <SalaryTab employeeId={e.id} />
          </TabsContent>
        )}
        {canSeeDocuments && (
          <TabsContent value="documents">
            <DocumentsTab employeeId={e.id} />
          </TabsContent>
        )}
        {allowedTab.warnings && (
          <TabsContent value="warnings">
            <div className="space-y-4">
              <ProposeWarningButton employeeId={e.id} />
              <WarningsList employeeId={e.id} />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
