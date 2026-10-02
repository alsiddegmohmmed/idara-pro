import { PERMISSIONS, type WarningView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { ltr, todayInRiyadh } from "@/lib/dates";
import { usePageCrumb } from "@/app/shell/crumb";
import { useEmployee, useEmployees, useRefs } from "../api";
import { ContactsPanel } from "../contacts-panel";
import { ContractsTab } from "../contracts-tab";
import { InsuranceTab } from "../insurance-tab";
import { DocumentPreview } from "../document-preview";
import { DocumentsTable, DocumentUploadForm } from "../documents";
import { nameIn } from "../employee-name";
import { Fact, MaskedValue } from "../record-header";
import { LeaveHistory, OverviewTab, RecordAudit, Section, ShortLeaveHistory, SummaryRail } from "../record-parts";
import { PersonMonth } from "@/features/attendance/pages/attendance-person-page";
import { ProposeDialog } from "@/features/adjustments/pages/adjustments-page";
import { ProposeWarningButton, WarningsList } from "@/features/discipline/warnings";
import { DatePicker } from "@/components/ui/date-picker";

const COMPONENT_TYPES = ["basic", "housing", "transport", "other"] as const;

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

/** Label / value grid that hides empty values behind one "أكمل البيانات" prompt (no wall of dashes). */
function FactsGrid({ facts, completeTo }: { facts: Array<{ key: string; label: string; value: React.ReactNode }>; completeTo?: (key: string) => string }): React.JSX.Element {
  const { t } = useTranslation();
  const [showEmpty, setShowEmpty] = useState(false);
  const filled = facts.filter((f) => Boolean(f.value));
  const empty = facts.filter((f) => !f.value);
  return (
    <>
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
          {completeTo && (
            <Button variant="secondary" size="sm" asChild icon={<Pencil />}>
              <Link to={completeTo(empty[0]?.key ?? "")}>{t("employees.completeData", { count: empty.length })}</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** البيانات الشخصية: identity and contact details (each section edited on its own) and trusted contacts. */
function PersonalTab({ e }: { e: Employee }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can, claims } = useAuth();
  const canEdit = can(PERMISSIONS.EMPLOYEES_UPDATE);
  const sensitive = can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE);
  const edit = (section: string, focus = ""): string => `/employees/${e.id}/edit?section=${section}&tab=personal${focus ? `&focus=${focus}` : ""}`;
  return (
    <div className="space-y-6">
      <Section title={t("employees.sections.basic")} editTo={canEdit ? edit("basic") : undefined}>
        <FactsGrid
          completeTo={canEdit ? (key) => edit("basic", key) : undefined}
          facts={[
            { key: "fullNameAr", label: t("employees.fields.fullNameAr"), value: e.fullNameAr },
            { key: "fullNameEn", label: t("employees.fields.fullNameEn"), value: e.fullNameEn && <bdi>{e.fullNameEn}</bdi> },
            { key: "nationality", label: t("employees.fields.nationality"), value: countryName(e.nationality, i18n.language) },
            { key: "nationalId", label: e.isSaudi ? t("employees.fields.nationalIdSaudi") : t("employees.fields.iqama"), value: <MaskedValue value={e.nationalId} /> },
            { key: "gender", label: t("employees.fields.gender"), value: e.gender && t(`employees.gender.${e.gender}`) },
            ...(sensitive
              ? [
                  { key: "birthDate", label: t("employees.fields.birthDate"), value: e.birthDate && <bdi className="tabular-nums">{e.birthDate.slice(0, 10)}</bdi> },
                  { key: "maritalStatus", label: t("employees.fields.maritalStatus"), value: e.maritalStatus && t(`employees.marital.${e.maritalStatus}`) },
                ]
              : []),
          ]}
        />
      </Section>
      {sensitive && (
        <Section title={t("employees.sections.contact")} editTo={canEdit ? edit("contact") : undefined}>
          <FactsGrid
            completeTo={canEdit ? (key) => edit("contact", key) : undefined}
            facts={[
              { key: "phone", label: t("employees.fields.phone"), value: e.phone && <bdi dir="ltr">{e.phone}</bdi> },
              { key: "additionalPhone", label: t("employees.fields.additionalPhone"), value: e.additionalPhone && <bdi dir="ltr">{e.additionalPhone}</bdi> },
              { key: "personalEmail", label: t("employees.fields.personalEmail"), value: e.personalEmail && <bdi>{e.personalEmail}</bdi> },
              // Shown when on file; not offered as "missing" — the form has no address field yet.
              ...(e.address ? [{ key: "address", label: t("employees.fields.address"), value: e.address }] : []),
            ]}
          />
        </Section>
      )}
      {sensitive && <ContactsPanel basePath={`/api/v1/employees/${e.id}/contacts`} canEdit={canEdit && e.userId !== claims?.sub} />}
    </div>
  );
}

/** الوظيفة: the job (edited as one section), contracts, and the sign-in account. */
function JobTab({ e, department, branch, manager, notRestored }: { e: Employee; department?: string; branch?: string; manager?: Employee; notRestored: boolean }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const canEdit = can(PERMISSIONS.EMPLOYEES_UPDATE);
  const schedules = useRefs("work-schedules");
  const schedule = schedules.data?.find((s) => s.id === e.scheduleId)?.name;
  const edit = (focus = ""): string => `/employees/${e.id}/edit?section=job&tab=job${focus ? `&focus=${focus}` : ""}`;
  return (
    <div className="space-y-6">
      <Section title={t("employees.sections.job")} editTo={canEdit ? edit() : undefined}>
        <FactsGrid
          completeTo={canEdit ? (key) => edit(key) : undefined}
          facts={[
            { key: "positionId", label: t("employees.fields.jobTitle"), value: e.jobTitle },
            { key: "departmentId", label: t("employees.fields.department"), value: department },
            { key: "branchId", label: t("employees.fields.branch"), value: branch },
            {
              key: "managerId",
              label: t("employees.fields.manager"),
              value: manager && (
                <Link to={`/employees/${manager.id}`} className="text-primary underline-offset-4 hover:underline">
                  {nameIn(i18n, manager)}
                </Link>
              ),
            },
            { key: "scheduleId", label: t("employees.fields.schedule"), value: schedule },
            { key: "hireDate", label: t("employees.fields.hireDate"), value: <bdi className="tabular-nums">{e.hireDate.slice(0, 10)}</bdi> },
            { key: "endDate", label: t("employees.fields.endDate"), value: e.endDate && <bdi className="tabular-nums">{e.endDate.slice(0, 10)}</bdi> },
            { key: "status", label: t("employees.fields.status"), value: t(`employees.status.${e.status}`) },
          ]}
        />
      </Section>
      {can(PERMISSIONS.CONTRACTS_READ) && (
        <Section title={t("employees.sections.contracts")}>
          <ContractsTab basePath={`/api/v1/employees/${e.id}/contracts`} />
        </Section>
      )}
      <InvitePanel employeeId={e.id} linked={Boolean(e.userId)} />
      <AccessPanel employeeId={e.id} linked={Boolean(e.userId)} notRestored={notRestored} />
    </div>
  );
}

/** الراتب والمزايا: salary components with the current total, the bank account, medical insurance. */
function PayTab({ e }: { e: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const salary = useQuery({
    queryKey: ["salary", e.id],
    queryFn: () => apiJson<SalaryComponent[]>(`/api/v1/employees/${e.id}/salary-components`),
    enabled: can(PERMISSIONS.SALARY_READ),
  });
  const today = todayInRiyadh();
  const total = (salary.data ?? [])
    .filter((c) => c.effectiveFrom.slice(0, 10) <= today && (!c.effectiveTo || c.effectiveTo.slice(0, 10) >= today))
    .reduce((sum, c) => sum + BigInt(c.amountHalalas), 0n);
  return (
    <div className="space-y-6">
      {can(PERMISSIONS.SALARY_READ) && (
        <Section title={t("employees.tabs.salary")}>
          {salary.data && salary.data.length > 0 && (
            <p className="mb-4 text-dense text-ink-muted">
              {t("employees.pay.total")}{" "}
              <span className="text-section tabular-nums text-ink">
                <bdi>{formatHalalas(total.toString())}</bdi>
              </span>{" "}
              {t("employees.salary.sar")}
            </p>
          )}
          <SalaryTab employeeId={e.id} />
        </Section>
      )}
      {can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE) && (
        <Section title={t("employees.sections.bank")} editTo={can(PERMISSIONS.EMPLOYEES_REVIEW) && can(PERMISSIONS.EMPLOYEES_UPDATE) ? `/employees/${e.id}/edit?section=bank&tab=pay` : undefined}>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Fact label={t("employees.fields.iban")}>{e.iban ? <bdi className="tabular-nums">{e.iban}</bdi> : undefined}</Fact>
          </dl>
          {e.ibanReviewStatus === "pending_review" && (
            <Alert tone="warning" className="mt-4">
              <Link to="/review-queue" className="underline underline-offset-2">
                {t("employees.ibanWaiting")}
              </Link>
            </Alert>
          )}
        </Section>
      )}
      {can(PERMISSIONS.INSURANCE_READ) && (
        <Section title={t("employees.sections.insurance")}>
          <InsuranceTab basePath={`/api/v1/employees/${e.id}/insurance`} />
        </Section>
      )}
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

/** Tabs by purpose (ux-redesign-v2 §4). Old links (?tab=contracts, salary, insurance, warnings) still land right. */
const TABS = ["overview", "job", "time", "pay", "documents", "personal", "history"] as const;
type Tab = (typeof TABS)[number];
const LEGACY_TAB: Record<string, Tab> = { contracts: "job", salary: "pay", insurance: "pay", warnings: "history" };

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
  const documents = useQuery({
    queryKey: ["documents", id],
    queryFn: () => apiJson<EmployeeDocument[]>(`/api/v1/employees/${id}/documents`),
    enabled: Boolean(id) && can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE),
  });
  const warnings = useQuery({
    queryKey: ["warnings", "", id ?? ""],
    queryFn: () => apiJson<WarningView[]>(`/api/v1/warnings?employeeId=${id}`),
    enabled: Boolean(id) && can(PERMISSIONS.WARNINGS_READ),
  });
  const [proposing, setProposing] = useState(false);
  usePageCrumb(e ? nameIn(i18n, e) : null);

  const allowed: Record<Tab, boolean> = {
    overview: true,
    job: true,
    time: can(PERMISSIONS.ATTENDANCE_READ) || can(PERMISSIONS.LEAVE_READ) || can(PERMISSIONS.SHORTLEAVE_READ),
    pay: can(PERMISSIONS.SALARY_READ) || can(PERMISSIONS.INSURANCE_READ) || can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE),
    // Identity documents are personal data: only for employees:read-sensitive holders.
    documents: can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE),
    personal: true,
    history: can(PERMISSIONS.WARNINGS_READ) || can(PERMISSIONS.AUDIT_READ),
  };
  const raw = params.get("tab") ?? "";
  const wanted = LEGACY_TAB[raw] ?? raw;
  const tab: Tab = TABS.find((x) => x === wanted && allowed[x]) ?? "overview";
  const setTab = (value: string): void => {
    const next = new URLSearchParams(params);
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    next.delete("month");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  if (isLoading) return <RecordSkeleton />;
  if (isError || !e || !id) return <Alert>{t("common.loadFailed")}</Alert>;

  const department = departments.data?.find((d) => d.id === e.departmentId)?.name;
  const branch = branches.data?.find((b) => b.id === e.branchId)?.name;
  const activeWarnings = (warnings.data ?? []).filter((w) => w.status === "issued" && w.active).length;
  const tabLabel = (x: Tab): React.ReactNode => {
    const count = x === "documents" ? documents.data?.length : x === "history" ? activeWarnings : undefined;
    return (
      <>
        {t(`employees.tabs.${x}`)}
        {count ? <span className="ms-1.5 rounded-full bg-neutral-soft px-1.5 text-meta tabular-nums text-ink-muted">{count}</span> : null}
      </>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <SummaryRail
        e={e}
        department={department}
        branch={branch}
        manager={manager}
        actions={
          <>
            {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
              <Button variant="secondary" size="sm" asChild icon={<Pencil />}>
                <Link to={`/employees/${e.id}/edit`}>{t("common.edit")}</Link>
              </Button>
            )}
            <ProposeWarningButton employeeId={e.id} compact />
            {can(PERMISSIONS.ADJUSTMENTS_PROPOSE) && (
              <Button variant="secondary" size="sm" icon={<Receipt />} onClick={() => setProposing(true)}>
                {t("employees.rail.adjustment")}
              </Button>
            )}
            <RecordMenu employee={e} />
          </>
        }
      />

      <div className="min-w-0">
        <Tabs preload value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.filter((x) => allowed[x]).map((x) => (
              <TabsTrigger key={x} value={x}>
                {tabLabel(x)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab e={e} onTab={setTab} />
          </TabsContent>
          <TabsContent value="job">
            <JobTab e={e} department={department} branch={branch} manager={manager} notRestored={notRestored} />
          </TabsContent>
          {allowed.time && (
            <TabsContent value="time">
              <div className="space-y-6">
                {can(PERMISSIONS.ATTENDANCE_READ) && <PersonMonth employeeId={e.id} embedded />}
                {can(PERMISSIONS.LEAVE_READ) && <LeaveHistory employeeId={e.id} />}
                {can(PERMISSIONS.SHORTLEAVE_READ) && <ShortLeaveHistory employeeId={e.id} />}
              </div>
            </TabsContent>
          )}
          {allowed.pay && (
            <TabsContent value="pay">
              <PayTab e={e} />
            </TabsContent>
          )}
          {allowed.documents && (
            <TabsContent value="documents">
              <DocumentsTab employeeId={e.id} />
            </TabsContent>
          )}
          <TabsContent value="personal">
            <PersonalTab e={e} />
          </TabsContent>
          {allowed.history && (
            <TabsContent value="history">
              <div className="space-y-6">
                {can(PERMISSIONS.WARNINGS_READ) && (
                  <Section title={t("discipline.title")}>
                    <div className="space-y-4">
                      <WarningsList employeeId={e.id} />
                    </div>
                  </Section>
                )}
                {can(PERMISSIONS.AUDIT_READ) && <RecordAudit employeeId={e.id} />}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
      {can(PERMISSIONS.ADJUSTMENTS_PROPOSE) && (
        <ProposeDialog open={proposing} onClose={() => setProposing(false)} period={todayInRiyadh().slice(0, 7)} employeeId={e.id} />
      )}
    </div>
  );
}
