import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatHalalas, sarToHalalas } from "@/lib/money";
import type { Employee, EmployeeDocument, SalaryComponent } from "@/lib/types";
import { useEmployee, useEmployees, useRefs } from "../api";
import { DocumentPreview } from "../document-preview";
import { DocumentsTable, DocumentUploadForm } from "../documents";
import { nameIn } from "../employee-name";
import { Fact, RecordHeader } from "../record-header";

const COMPONENT_TYPES = ["basic", "housing", "transport", "other"] as const;
const TABS = ["job", "salary", "documents"] as const;

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

  if (!linked) return null;
  const allowed = can(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS);
  if (!allowed && !notRestored) return null;
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
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title={t("employees.sections.personal")} />
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t("employees.fields.fullNameAr")}>{e.fullNameAr}</Fact>
          <Fact label={t("employees.fields.fullNameEn")}>
            <bdi>{e.fullNameEn}</bdi>
          </Fact>
          <Fact label={t("employees.fields.nationality")}>{e.nationality}</Fact>
          <Fact label={t("employees.fields.phone")}>{e.phone && <bdi>{e.phone}</bdi>}</Fact>
          <Fact label={t("employees.fields.personalEmail")}>{e.personalEmail && <bdi>{e.personalEmail}</bdi>}</Fact>
          <Fact label={t("employees.fields.address")}>{e.address}</Fact>
          <Fact label={t("employees.fields.emergencyContact")}>
            {e.emergencyContactName ? (
              <>
                {e.emergencyContactName} · <bdi>{e.emergencyContactPhone}</bdi>
              </>
            ) : null}
          </Fact>
          <Fact label={t("employees.fields.iban")}>{e.iban && <bdi className="tabular-nums">{e.iban}</bdi>}</Fact>
          <Fact label={t("employees.fields.endDate")}>{e.endDate && <bdi>{e.endDate.slice(0, 10)}</bdi>}</Fact>
        </dl>
        {e.ibanReviewStatus === "pending_review" && (
          <Alert tone="warning" className="mt-4">
            <Link to="/review-queue" className="underline underline-offset-2">
              {t("employees.ibanWaiting")}
            </Link>
          </Alert>
        )}
      </Panel>
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
      {list.isLoading && <Skeleton className="h-40" />}
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
                  <bdi>
                    {c.effectiveFrom.slice(0, 10)} → {c.effectiveTo?.slice(0, 10) ?? t("employees.salary.open")}
                  </bdi>
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
              <Input id="c-from" type="date" dir="ltr" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </Field>
            <Field label={t("employees.salary.to")} htmlFor="c-to">
              <Input id="c-to" type="date" dir="ltr" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
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
      {list.isLoading && <Skeleton className="h-40" />}
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

  const tabParam = params.get("tab");
  // Salaries are HR and Accounting only (ADR-0011 §7): no tab at all for anyone else.
  const canSeeSalary = can(PERMISSIONS.SALARY_READ);
  const tab = TABS.find((x) => x === tabParam && (x !== "salary" || canSeeSalary)) ?? "job";

  if (isLoading) {
    return (
      <div className="space-y-6" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-56" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError || !e || !id) return <Alert>{t("common.loadFailed")}</Alert>;

  const department = departments.data?.find((d) => d.id === e.departmentId)?.name;
  const branch = branches.data?.find((b) => b.id === e.branchId)?.name;

  return (
    <div className="space-y-6">
      <RecordHeader
        employee={e}
        actions={
          can(PERMISSIONS.EMPLOYEES_UPDATE) && (
            <Button variant="secondary" asChild icon={<Pencil />}>
              <Link to={`/employees/${e.id}/edit`}>{t("common.edit")}</Link>
            </Button>
          )
        }
        facts={
          <>
            <Fact label={t("employees.fields.employeeNo")}>
              <bdi>{e.employeeNo}</bdi>
            </Fact>
            <Fact label={t("employees.fields.nationalId")}>
              {/* Masked by the API for anyone without employees:read-sensitive (ADR-0011 §3). */}
              <bdi className="tabular-nums">{e.nationalId}</bdi>
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
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === "job") next.delete("tab");
          else next.set("tab", value);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="job">{t("employees.tabs.job")}</TabsTrigger>
          {canSeeSalary && <TabsTrigger value="salary">{t("employees.tabs.salary")}</TabsTrigger>}
          <TabsTrigger value="documents">{t("employees.tabs.documents")}</TabsTrigger>
        </TabsList>
        <TabsContent value="job">
          <JobDetailsTab e={e} notRestored={notRestored} />
        </TabsContent>
        {canSeeSalary && (
          <TabsContent value="salary">
            <SalaryTab employeeId={e.id} />
          </TabsContent>
        )}
        <TabsContent value="documents">
          <DocumentsTab employeeId={e.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
