import { PERMISSIONS, type AccessUserView, type AssignmentAccessView } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useRefs } from "@/features/employees/api";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { accessKeys, roleName, useAccessRoles, useAccessUsers } from "./api";
import { DatePicker } from "@/components/ui/date-picker";

const ERRORS: Record<string, string> = {
  "access.escalation": "access.errors.escalation",
  "access.own_access": "access.errors.ownAccess",
  "access.last_super_admin": "access.errors.lastSuperAdmin",
  "access.role.archived": "access.errors.archived",
};
const errorKey = (e: unknown, fallback: string): string => (e instanceof ApiError && ERRORS[e.code]) || fallback;

/** People and the roles they hold — assign or remove, with branches and dates. */
export function PeopleTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can, claims } = useAuth();
  const queryClient = useQueryClient();
  const users = useAccessUsers();
  const branches = useRefs("branches");
  const [query, setQuery] = useState("");
  const [assignTo, setAssignTo] = useState<AccessUserView | null>(null);
  const canManage = can(PERMISSIONS.ACCESS_MANAGE);

  const remove = useMutation({
    mutationFn: (a: AssignmentAccessView) => apiJson(`/api/v1/access/assignments/${a.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("access.people.removed"));
      return queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(t(errorKey(e, "access.errors.failed"))),
  });

  const branchNames = (a: AssignmentAccessView): string =>
    a.branchMode === "home" ? t("access.people.homeBranch") : a.branchIds.map((id) => branches.data?.find((b) => b.id === id)?.name ?? "—").join("، ");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) => !q || u.email.toLowerCase().includes(q) || u.employee?.fullNameAr.includes(q) || u.employee?.fullNameEn.toLowerCase().includes(q),
    );
  }, [users.data, query]);

  if (users.isLoading) return <Skeleton className="h-64" />;
  if (users.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Input placeholder={t("access.people.search")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("access.people.search")} />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("access.people.empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("access.people.person")}</TableHead>
              <TableHead>{t("access.people.roles")}</TableHead>
              {canManage && <TableHead className="w-32"><span className="sr-only">{t("access.people.actions")}</span></TableHead>}
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const self = u.userId === claims?.sub;
              return (
                <TableRow key={u.userId}>
                  <TableCell>
                    <div className="font-medium">
                      {u.employee ? (i18n.language === "ar" ? u.employee.fullNameAr : u.employee.fullNameEn) : <bdi>{u.email}</bdi>}
                    </div>
                    <div className="text-meta text-ink-muted">
                      <bdi>{u.email}</bdi>
                      {u.status !== "active" && <> · {t(`access.people.status.${u.status}`)}</>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {u.assignments.length === 0 && <span className="text-dense text-ink-muted">{t("access.people.noRoles")}</span>}
                      {u.assignments.map((a) => (
                        <Badge key={a.id} tone={a.active ? "info" : "neutral"} className="gap-1">
                          <span>{roleName(i18n.language, { name: a.roleName, nameAr: a.roleNameAr })}</span>
                          <span className="text-ink-muted">· {branchNames(a)}</span>
                          {(a.validFrom || a.validTo) && (
                            <span className="tabular-nums text-ink-muted">
                              · <bdi dir="ltr">{a.validFrom ?? "…"} → {a.validTo ?? "…"}</bdi>
                            </span>
                          )}
                          {canManage && !self && (
                            <button
                              type="button"
                              className="ms-1 rounded hover:text-danger"
                              aria-label={t("access.people.remove")}
                              onClick={() => {
                                if (window.confirm(t("access.people.confirmRemove"))) remove.mutate(a);
                              }}
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {!self && (
                        <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setAssignTo(u)}>
                          {t("access.people.assign")}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {assignTo && <AssignDialog user={assignTo} onClose={() => setAssignTo(null)} onDone={() => void queryClient.invalidateQueries({ queryKey: accessKeys.users })} />}
    </div>
  );
}

function AssignDialog({ user, onClose, onDone }: { user: AccessUserView; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const roles = useAccessRoles();
  const branches = useRefs("branches");
  const [roleId, setRoleId] = useState("");
  const [branchMode, setBranchMode] = useState<"home" | "selected">("home");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const role = roles.data?.find((r) => r.id === roleId);
  const hasBranchReach = role?.grants.some((g) => g.scope === "branch") ?? false;

  const save = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/access/assignments", {
        method: "POST",
        ...jsonBody({
          userId: user.userId,
          roleId,
          branchMode,
          branchIds: branchMode === "selected" ? branchIds : [],
          validFrom: validFrom || null,
          validTo: validTo || null,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast.success(t("access.people.assigned"));
      onDone();
      onClose();
    },
    onError: (e) => setError(t(errorKey(e, "access.errors.failed"))),
  });

  const valid = roleId !== "" && (branchMode === "home" || branchIds.length > 0) && (!validFrom || !validTo || validFrom <= validTo);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("access.people.assignTitle")}</DialogTitle>
          <DialogDescription>
            <bdi>{user.employee ? (i18n.language === "ar" ? user.employee.fullNameAr : user.employee.fullNameEn) : user.email}</bdi>
          </DialogDescription>
        </DialogHeader>
        <form
          id="assign-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Field label={t("access.people.role")} htmlFor="a-role">
              <NativeSelect id="a-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                <option value="">{t("access.people.chooseRole")}</option>
                {roles.data
                  ?.filter((r) => !r.archived)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {roleName(i18n.language, r)}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            {role && (role.key || role.description) && (
              <p className="mt-1 text-meta text-ink-muted">{role.key ? t(`access.systemRoles.${role.key}`) : role.description}</p>
            )}
          </div>
          {hasBranchReach && (
            <div className="sm:col-span-2 space-y-2">
              <Field label={t("access.people.where")} htmlFor="a-mode">
                <NativeSelect id="a-mode" value={branchMode} onChange={(e) => setBranchMode(e.target.value as "home" | "selected")}>
                  <option value="home">{t("access.people.homeBranch")}</option>
                  <option value="selected">{t("access.people.selectedBranches")}</option>
                </NativeSelect>
              </Field>
              {branchMode === "home" && !user.employee?.branchId && (
                <Alert tone="warning">{t("access.people.noHomeBranch")}</Alert>
              )}
              {branchMode === "selected" && (
                <fieldset className="flex flex-wrap gap-3 rounded-panel border border-line p-3">
                  <legend className="sr-only">{t("access.people.selectedBranches")}</legend>
                  {branches.data?.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-dense">
                      <input
                        type="checkbox"
                        checked={branchIds.includes(b.id)}
                        onChange={(e) => setBranchIds((ids) => (e.target.checked ? [...ids, b.id] : ids.filter((x) => x !== b.id)))}
                      />
                      {b.name}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
          <Field label={t("access.people.from")} htmlFor="a-from" hint={t("access.people.datesHint")}>
            <DatePicker id="a-from" value={validFrom} onChange={(v) => setValidFrom(v)} />
          </Field>
          <Field label={t("access.people.to")} htmlFor="a-to">
            <DatePicker id="a-to" value={validTo} onChange={(v) => setValidTo(v)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("access.people.note")} htmlFor="a-note">
              <Input id="a-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="assign-form" loading={save.isPending} disabled={!valid}>
            {t("access.people.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
