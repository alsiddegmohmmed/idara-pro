import type { ContractView, MyWorkplaceView, WarningView } from "@idara-pro/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, CalendarDays, CheckCircle2, ChevronLeft, Hash, MapPin, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MyWarningsPanel } from "@/features/discipline/warnings";
import { ContactsPanel } from "@/features/employees/contacts-panel";
import { ContractsTab } from "@/features/employees/contracts-tab";
import { DocumentsTable, DocumentUploadForm } from "@/features/employees/documents";
import { nameIn } from "@/features/employees/employee-name";
import { InsuranceTab } from "@/features/employees/insurance-tab";
import { useTenure } from "@/features/employees/record-parts";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { apiJson } from "@/lib/api";
import { todayInRiyadh } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Employee, EmployeeDocument, SalaryComponent } from "@/lib/types";
import { BasicInfoCard, Card, ContactCard, IbanCard, JobCard, SalaryCard } from "../profile-parts";

// ملفي الشخصي — the employee's own record, laid out like the HR record (ux-redesign-v2 §4) but for
// self-service: a header that says who I am and where I work, tabs by purpose, read first and edit one
// card at a time. What HR owns is read-only with a lock; the salary is hidden until asked for.

const TABS = ["overview", "personal", "pay", "contracts", "documents", "warnings"] as const;
type Tab = (typeof TABS)[number];
const EXPIRY_NOTICE_DAYS = 60;

const daysUntil = (from: string, to: string): number =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

interface ContactRow {
  id: string;
  isEmergency: boolean;
}

interface Todo {
  key: string;
  tone: "danger" | "warning" | "info";
  text: string;
  action: string;
  go: () => void;
}

export function MyProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMyEmployee();
  if (me.isLoading) {
    return (
      <div className="space-y-6" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-40" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (!me.employee) return <Alert tone="info">{t("profile.noEmployee")}</Alert>;
  return <Profile e={me.employee} />;
}

function Profile({ e }: { e: Employee }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const tenure = useTenure(e.hireDate);
  const today = todayInRiyadh();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<"contact" | "iban" | null>(null);
  const [uploading, setUploading] = useState(false);

  const workplace = useQuery({ queryKey: ["me", "workplace"], queryFn: () => apiJson<MyWorkplaceView>("/api/v1/me/workplace") });
  const salary = useQuery({ queryKey: ["me", "salary"], queryFn: () => apiJson<SalaryComponent[]>("/api/v1/me/salary-components") });
  const documents = useQuery({ queryKey: ["me", "documents"], queryFn: () => apiJson<EmployeeDocument[]>("/api/v1/me/documents") });
  const contracts = useQuery({ queryKey: ["contracts", "/api/v1/me/contracts"], queryFn: () => apiJson<ContractView[]>("/api/v1/me/contracts") });
  const contacts = useQuery({ queryKey: ["contacts", "/api/v1/me/contacts"], queryFn: () => apiJson<ContactRow[]>("/api/v1/me/contacts") });
  const warnings = useQuery({ queryKey: ["warnings", "me"], queryFn: () => apiJson<WarningView[]>("/api/v1/me/warnings") });

  const toAcknowledge = (warnings.data ?? []).filter((w) => w.actions.includes("acknowledge")).length;
  const hasWarnings = (warnings.data?.length ?? 0) > 0;
  const allowed = (x: Tab): boolean => x !== "warnings" || hasWarnings;
  // Notifications link to ?section=warnings (older links) or ?tab=…
  const raw = params.get("tab") ?? (params.get("section") === "warnings" ? "warnings" : "");
  const tab: Tab = TABS.find((x) => x === raw && allowed(x)) ?? "overview";
  const go = (value: string, edit: "contact" | "iban" | null = null): void => {
    const next = new URLSearchParams(params);
    next.delete("section");
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    setParams(next, { replace: true, preventScrollReset: true });
    setEditing(edit);
  };

  const contract = contracts.data?.find((c) => c.status === "active");

  // ---- what needs me, and how complete my file is
  const todos: Todo[] = [];
  if (e.ibanReviewStatus === "rejected") {
    todos.push({ key: "iban-rejected", tone: "danger", text: t("profile.todo.ibanRejected"), action: t("profile.iban.change"), go: () => go("pay", "iban") });
  } else if (!e.iban && e.ibanReviewStatus !== "pending_review") {
    todos.push({ key: "iban", tone: "warning", text: t("profile.todo.noIban"), action: t("profile.iban.add"), go: () => go("pay", "iban") });
  }
  if (toAcknowledge > 0) {
    todos.push({ key: "warnings", tone: "warning", text: t("profile.todo.warnings", { count: toAcknowledge }), action: t("profile.todo.read"), go: () => go("warnings") });
  }
  for (const d of documents.data ?? []) {
    const type = t(`documents.types.${d.type}`);
    if (d.reviewStatus === "rejected") {
      todos.push({ key: `doc-r-${d.id}`, tone: "danger", text: t("profile.todo.documentRejected", { type }), action: t("profile.todo.view"), go: () => go("documents") });
    } else if (d.expiryDate && daysUntil(today, d.expiryDate) <= EXPIRY_NOTICE_DAYS) {
      const left = daysUntil(today, d.expiryDate);
      todos.push({
        key: `doc-e-${d.id}`,
        tone: left < 0 ? "danger" : "warning",
        text: left < 0 ? t("profile.todo.documentExpired", { type }) : t("profile.todo.documentExpiring", { type, date: d.expiryDate.slice(0, 10) }),
        action: t("profile.todo.upload"),
        go: () => {
          go("documents");
          setUploading(true);
        },
      });
    }
  }
  const checks = [
    { done: Boolean(e.phone), label: t("employees.fields.phone"), go: () => go("personal", "contact") },
    { done: Boolean(e.personalEmail), label: t("employees.fields.personalEmail"), go: () => go("personal", "contact") },
    { done: Boolean(e.address), label: t("employees.fields.address"), go: () => go("personal", "contact") },
    { done: (contacts.data ?? []).some((c) => c.isEmergency), label: t("profile.complete.emergency"), go: () => go("personal") },
    { done: Boolean(e.iban) || e.ibanReviewStatus === "pending_review", label: t("profile.complete.iban"), go: () => go("pay", "iban") },
    { done: (documents.data?.length ?? 0) > 0, label: t("profile.complete.document"), go: () => go("documents") },
  ];
  const loaded = contacts.isSuccess && documents.isSuccess;
  const percent = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  const tabLabel = (x: Tab): ReactNode => {
    const count = x === "warnings" ? toAcknowledge : x === "documents" ? documents.data?.length : undefined;
    return (
      <>
        {t(`profile.tabs.${x}`)}
        {count ? (
          <span className={cn("ms-1.5 rounded-full px-1.5 text-meta tabular-nums", x === "warnings" ? "bg-warning-soft text-warning" : "bg-neutral-soft text-ink-muted")}>{count}</span>
        ) : null}
      </>
    );
  };

  return (
    <div className="mx-auto max-w-[1080px]">
      {/* ---- who I am */}
      <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <Avatar name={e.fullNameAr} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-page-title text-ink">{nameIn(i18n, e)}</h1>
              <Badge tone={e.status === "active" ? "success" : "neutral"} dot>
                {t(`employees.status.${e.status}`)}
              </Badge>
            </div>
            {e.jobTitle && <p className="mt-0.5 text-body text-ink-muted">{e.jobTitle}</p>}
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-dense text-ink-muted">
              {workplace.data?.department && <Meta icon={<Building2 />}>{workplace.data.department}</Meta>}
              {workplace.data?.branch && <Meta icon={<MapPin />}>{workplace.data.branch}</Meta>}
              <Meta icon={<Hash />}>
                <bdi>{e.employeeNo}</bdi>
              </Meta>
              <Meta icon={<CalendarDays />}>{t("profile.since", { tenure })}</Meta>
            </ul>
          </div>
        </div>
      </section>

      {/* ---- the detail, by purpose */}
      <Tabs className="mt-4" value={tab} onValueChange={(v) => go(v)}>
        <TabsList>
          {TABS.filter(allowed).map((x) => (
            <TabsTrigger key={x} value={x}>
              {tabLabel(x)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="min-w-0 space-y-6">
              {todos.length > 0 && (
                <Card title={t("profile.todo.title")}>
                  <ul className="-my-2 divide-y divide-line">
                    {todos.map((x) => (
                      <li key={x.key} className="flex flex-wrap items-center gap-3 py-3">
                        <AlertCircle className={cn("size-5 shrink-0", x.tone === "danger" ? "text-danger" : x.tone === "warning" ? "text-warning" : "text-info")} aria-hidden />
                        <span className="min-w-0 flex-1 text-body text-ink">{x.text}</span>
                        <Button variant="secondary" size="sm" onClick={x.go}>
                          {x.action}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <JobCard e={e} workplace={workplace.data} tenure={tenure} contract={contract} />
            </div>
            <div className="space-y-6">
              {loaded && (
                <Card title={t("profile.complete.title")}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-page-title tabular-nums text-ink">{percent}%</span>
                    {percent === 100 && <CheckCircle2 className="size-5 text-success" aria-hidden />}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("profile.complete.title")}>
                    <div className={cn("h-full rounded-full", percent === 100 ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
                  </div>
                  <ul className="mt-4 space-y-1">
                    {checks.map((c) => (
                      <li key={c.label}>
                        {c.done ? (
                          <span className="flex items-center gap-2 py-1 text-dense text-ink-muted">
                            <CheckCircle2 className="size-4 text-success" aria-hidden />
                            {c.label}
                          </span>
                        ) : (
                          <button type="button" onClick={c.go} className="flex w-full items-center gap-2 rounded-control py-1 text-start text-dense text-ink hover:text-primary">
                            <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden />
                            <span className="flex-1">{t("profile.complete.add", { what: c.label })}</span>
                            <ChevronLeft className="size-4 text-ink-muted ltr:rotate-180" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {/* Edited on البيانات الشخصية, so the form exists once. */}
              <ContactCard me={e} narrow editing={false} onEditing={(v) => v && go("personal", "contact")} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="personal">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <BasicInfoCard e={e} />
            <div className="space-y-6">
              <ContactCard me={e} editing={editing === "contact"} onEditing={(v) => setEditing(v ? "contact" : null)} />
              <ContactsPanel basePath="/api/v1/me/contacts" canEdit />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pay">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <SalaryCard components={salary.data} />
            <IbanCard me={e} editing={editing === "iban"} onEditing={(v) => setEditing(v ? "iban" : null)} />
          </div>
        </TabsContent>

        <TabsContent value="contracts">
          <div className="space-y-6">
            <Card title={t("employees.sections.contracts")} action={<span className="text-meta text-ink-muted">{t("profile.hrOwned")}</span>}>
              <ContractsTab basePath="/api/v1/me/contracts" readOnly />
            </Card>
            <Card title={t("employees.sections.insurance")}>
              <InsuranceTab basePath="/api/v1/me/insurance" readOnly />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card
            title={t("profile.documents.title")}
            action={
              <Button size="sm" icon={<Upload />} onClick={() => setUploading(true)}>
                {t("profile.documents.upload")}
              </Button>
            }
          >
            <p className="mb-4 text-dense text-ink-muted">{t("profile.documents.note")}</p>
            {documents.isLoading && <Skeleton className="h-24" />}
            {documents.data && documents.data.length === 0 && (
              <div className="rounded-panel border border-dashed border-line px-4 py-10 text-center">
                <p className="text-body text-ink-muted">{t("documents.empty")}</p>
                <Button className="mt-4" variant="secondary" size="sm" icon={<Upload />} onClick={() => setUploading(true)}>
                  {t("profile.documents.upload")}
                </Button>
              </div>
            )}
            {documents.data && documents.data.length > 0 && (
              <DocumentsTable documents={documents.data} filePath={(d) => `/api/v1/me/documents/${d.id}/file`} />
            )}
          </Card>
        </TabsContent>

        {hasWarnings && (
          <TabsContent value="warnings">
            <MyWarningsPanel />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.documents.upload")}</DialogTitle>
            <DialogDescription>{t("profile.documents.note")}</DialogDescription>
          </DialogHeader>
          <DocumentUploadForm
            path="/api/v1/me/documents"
            onDone={() => {
              setUploading(false);
              void queryClient.invalidateQueries({ queryKey: ["me", "documents"] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <li className="inline-flex items-center gap-1.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </li>
  );
}
