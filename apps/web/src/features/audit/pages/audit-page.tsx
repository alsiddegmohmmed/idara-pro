import type { AuditEntryView, AuditPage as AuditPageData } from "@idara-pro/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";

// Every entity and action the API writes to the log (grep `entity: "` / `action: "` in apps/api). A value
// missing here still shows — as its raw code — so add new ones to both lists and to audit.* in the locales.
const ENTITIES = [
  "employees", "salary_components", "employee_documents", "employee_contacts", "contracts", "employee_insurance", "insurance_policies",
  "attendance_days", "leave_requests", "leave_balances", "leave_types", "shortleave_requests", "warnings", "payroll_adjustments",
  "payroll_runs", "custody_requests", "roles", "role_assignments", "users", "branches", "departments", "work_schedules", "holidays",
  "company_settings",
] as const;
const ACTIONS = [
  "create", "update", "delete", "view", "download", "export", "approve", "reject", "cancel", "correct", "propose", "issue", "rescind",
  "acknowledge", "calculate", "recalculate", "pay", "settle", "renew", "end", "attach", "assign_role", "unassign_role", "archive",
  "invite", "link_user", "disable_access", "enable_access", "submit_iban", "approve_iban", "reject_iban", "approve_document",
  "reject_document", "update_profile", "set_entitlement", "upsert",
] as const;

/** Fields that changed between before and after (or all of one side when the other is empty). */
function changes(e: AuditEntryView): Array<{ field: string; before: unknown; after: unknown }> {
  const b = (e.before ?? {}) as Record<string, unknown>;
  const a = (e.after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((f) => !["updatedAt", "createdAt", "companyId"].includes(f));
  return fields.filter((f) => JSON.stringify(b[f]) !== JSON.stringify(a[f])).map((f) => ({ field: f, before: b[f], after: a[f] }));
}
const show = (v: unknown): string => (v === undefined ? "" : v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** السجل: every create/update/delete, decision, download and sensitive view — newest first. Read-only. */
export function AuditPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ entity: "", action: "", from: "", to: "" });
  const [open, setOpen] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["audit", filters],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "50" });
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      if (pageParam) qs.set("cursor", pageParam);
      return apiJson<AuditPageData>(`/api/v1/audit?${qs.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title={t("audit.title")} description={t("audit.description")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("audit.entity")} htmlFor="au-entity">
          <NativeSelect id="au-entity" value={filters.entity} onChange={set("entity")}>
            <option value="">{t("audit.all")}</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {t(`audit.entities.${x}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("audit.action")} htmlFor="au-action">
          <NativeSelect id="au-action" value={filters.action} onChange={set("action")}>
            <option value="">{t("audit.all")}</option>
            {ACTIONS.map((x) => (
              <option key={x} value={x}>
                {t(`audit.actions.${x}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("audit.from")} htmlFor="au-from">
          <Input id="au-from" type="date" dir="ltr" value={filters.from} onChange={set("from")} />
        </Field>
        <Field label={t("audit.to")} htmlFor="au-to">
          <Input id="au-to" type="date" dir="ltr" value={filters.to} onChange={set("to")} />
        </Field>
      </div>
      {query.isLoading && <Skeleton className="h-64" />}
      {query.isError && <Alert>{t("common.loadFailed")}</Alert>}
      {query.data && rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("audit.empty")} />
        </div>
      )}
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-44">{t("audit.when")}</TableHead>
              <TableHead>{t("audit.who")}</TableHead>
              <TableHead>{t("audit.action")}</TableHead>
              <TableHead>{t("audit.entity")}</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">{t("audit.details")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const diff = changes(e);
              return (
                <Fragment key={e.id}>
                  <TableRow>
                    <TableCell className="tabular-nums text-dense">
                      <bdi dir="ltr">{formatDateTime(e.at)}</bdi>
                    </TableCell>
                    <TableCell className="text-dense">{e.actorEmail ? <bdi>{e.actorEmail}</bdi> : t("audit.system")}</TableCell>
                    <TableCell className="text-dense">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</TableCell>
                    <TableCell className="text-dense">
                      {e.entity === "employees" ? (
                        <Link className="underline underline-offset-2" to={`/employees/${e.entityId}`}>
                          {t("audit.entities.employees")}
                        </Link>
                      ) : (
                        t(`audit.entities.${e.entity}`, { defaultValue: e.entity })
                      )}
                    </TableCell>
                    <TableCell>
                      {diff.length > 0 && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-expanded={open === e.id}
                          aria-label={t("audit.details")}
                          onClick={() => setOpen(open === e.id ? null : e.id)}
                        >
                          <ChevronDown className={open === e.id ? "rotate-180" : undefined} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {open === e.id && (
                    <tr>
                      <td colSpan={5} className="bg-canvas px-4 py-3">
                        <dl className="grid gap-1 text-dense">
                          {diff.map((d) => (
                            <div key={d.field} className="grid grid-cols-[12rem_1fr] gap-3">
                              <dt className="font-medium" title={d.field}>
                                {t(`employees.fields.${d.field}`, { defaultValue: d.field })}
                              </dt>
                              <dd className="break-all">
                                {d.before !== undefined && <bdi className="text-danger line-through">{show(d.before)}</bdi>}
                                {d.before !== undefined && d.after !== undefined && <span aria-hidden="true" className="mx-1.5 inline-block rtl:-scale-x-100">→</span>}
                                {d.after !== undefined && <bdi>{show(d.after)}</bdi>}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
      {query.hasNextPage && (
        <div className="mt-4">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t("audit.more")}
          </Button>
        </div>
      )}
    </div>
  );
}
