import { PERMISSIONS } from "@idara-pro/shared";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, NativeSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth";
import type { Employee } from "@/lib/types";
import { REF_PERMISSION, useEmployees, useRefs } from "../api";
import { nameIn } from "../employee-name";

const PAGE_SIZE = 20;

/** ui-spec §7.2. Filters live in the URL so the view is shareable and survives refresh. */
export function EmployeesListPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError } = useEmployees();
  const departments = useRefs("departments");
  const branches = useRefs("branches");

  const q = params.get("q") ?? "";
  const department = params.get("department") ?? "";
  const branch = params.get("branch") ?? "";
  const status = params.get("status") ?? "";
  const account = params.get("account") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const deptName = useMemo(() => new Map(departments.data?.map((d) => [d.id, d.name])), [departments.data]);
  const branchName = useMemo(() => new Map(branches.data?.map((b) => [b.id, b.name])), [branches.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (e) =>
        (!needle ||
          e.fullNameAr.toLowerCase().includes(needle) ||
          e.fullNameEn.toLowerCase().includes(needle) ||
          e.employeeNo.toLowerCase().includes(needle)) &&
        (!department || e.departmentId === department) &&
        (!branch || e.branchId === branch) &&
        (!status || e.status === status) &&
        (!account || (account === "none" ? !e.userId : Boolean(e.userId))),
    );
  }, [data, q, department, branch, status, account]);
  const filtering = Boolean(q || department || branch || status || account);
  const clearFilters = (): void => setParams(new URLSearchParams(), { replace: true });

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const canCreate = can(PERMISSIONS.EMPLOYEES_CREATE);
  const canEdit = can(PERMISSIONS.EMPLOYEES_UPDATE);

  const addButton = canCreate ? (
    <Button asChild icon={<Plus />}>
      <Link to="/employees/new">{t("employees.add")}</Link>
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader title={t("employees.title")} description={t("employees.description")} actions={addButton} />

      {data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input
              type="search"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder={t("employees.filters.search")}
              aria-label={t("employees.filters.search")}
              className="ps-9"
            />
          </div>
          {can(REF_PERMISSION.departments) && (
          <NativeSelect
            value={department}
            onChange={(e) => setParam("department", e.target.value)}
            aria-label={t("employees.fields.department")}
            className="w-auto min-w-36 flex-1 sm:flex-none"
          >
            <option value="">{t("employees.filters.allDepartments")}</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          )}
          {can(REF_PERMISSION.branches) && (
          <NativeSelect
            value={branch}
            onChange={(e) => setParam("branch", e.target.value)}
            aria-label={t("employees.fields.branch")}
            className="w-auto min-w-36 flex-1 sm:flex-none"
          >
            <option value="">{t("employees.filters.allBranches")}</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          )}
          <NativeSelect
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
            aria-label={t("employees.fields.status")}
            className="w-auto min-w-32 flex-1 sm:flex-none"
          >
            <option value="">{t("employees.filters.allStatuses")}</option>
            <option value="active">{t("employees.status.active")}</option>
            <option value="inactive">{t("employees.status.inactive")}</option>
          </NativeSelect>
          <NativeSelect
            value={account}
            onChange={(e) => setParam("account", e.target.value)}
            aria-label={t("employees.fields.account")}
            className="w-auto min-w-32 flex-1 sm:flex-none"
          >
            <option value="">{t("employees.filters.allAccounts")}</option>
            <option value="linked">{t("employees.account.linked")}</option>
            <option value="none">{t("employees.account.none")}</option>
          </NativeSelect>
          {filtering && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t("employees.filters.clear")}
            </Button>
          )}
          <p className="ms-auto text-meta tabular-nums text-ink-muted" aria-live="polite">
            {t("employees.count", { count: filtered.length })}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-10" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      )}
      {isError && <p role="alert" className="text-danger">{t("common.loadFailed")}</p>}

      {data && data.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("employees.empty")} action={addButton} />
        </div>
      )}

      {data && data.length > 0 && filtered.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            message={t("employees.noMatches")}
            action={
              <Button variant="secondary" onClick={clearFilters}>
                {t("employees.filters.clear")}
              </Button>
            }
          />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>{t("employees.fields.employee")}</TableHead>
                <TableHead>{t("employees.fields.employeeNo")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("employees.fields.department")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("employees.fields.branch")}</TableHead>
                <TableHead>{t("employees.fields.status")}</TableHead>
                <TableHead className="w-14">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <EmployeeRow
                  key={e.id}
                  e={e}
                  name={nameIn(i18n, e)}
                  department={e.departmentId ? deptName.get(e.departmentId) : undefined}
                  branch={e.branchId ? branchName.get(e.branchId) : undefined}
                  canEdit={canEdit}
                  onOpen={() => navigate(`/employees/${e.id}`)}
                  onEdit={() => navigate(`/employees/${e.id}/edit`)}
                />
              ))}
            </TableBody>
          </Table>
          <Pagination page={current} pages={pages} total={filtered.length} onPage={(p) => setParam("page", p === 1 ? "" : String(p))} />
        </>
      )}
    </div>
  );
}

function EmployeeRow({
  e,
  name,
  department,
  branch,
  canEdit,
  onOpen,
  onEdit,
}: {
  e: Employee;
  name: string;
  department: string | undefined;
  branch: string | undefined;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <TableRow onClick={onOpen}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={e.fullNameAr} size="sm" />
          <div className="min-w-0">
            {/* The name is the keyboard entry point; the whole row is a mouse shortcut. */}
            <Link
              to={`/employees/${e.id}`}
              onClick={(ev) => ev.stopPropagation()}
              className="block truncate font-medium text-ink hover:text-primary"
            >
              {name}
            </Link>
            {e.jobTitle && <p className="truncate text-meta text-ink-muted">{e.jobTitle}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <bdi>{e.employeeNo}</bdi>
      </TableCell>
      <TableCell className="hidden md:table-cell">{department ?? "—"}</TableCell>
      <TableCell className="hidden lg:table-cell">{branch ?? "—"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={e.status === "active" ? "success" : "neutral"}>{t(`employees.status.${e.status}`)}</Badge>
          {e.ibanReviewStatus === "pending_review" && <Badge tone="warning">{t("review.status.pending_review")}</Badge>}
          {e.status === "active" && !e.userId && <Badge tone="info">{t("employees.account.none")}</Badge>}
        </div>
      </TableCell>
      <TableCell onClick={(ev) => ev.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("employees.rowActions", { name })}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onOpen}>{t("employees.view")}</DropdownMenuItem>
            {canEdit && <DropdownMenuItem onSelect={onEdit}>{t("common.edit")}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-meta tabular-nums text-ink-muted">{t("common.showing", { from, to, total })}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("common.previousPage")}>
            <ChevronRight className="ltr:-scale-x-100" />
          </Button>
          <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("common.nextPage")}>
            <ChevronLeft className="ltr:-scale-x-100" />
          </Button>
        </div>
      )}
    </div>
  );
}
