import { PERMISSIONS, ROLE_SCOPES, type RoleScope, type RoleView } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { TableSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { accessKeys, groupedPermissions, permissionKey, roleName, useAccessRoles } from "./api";

type Editing = { mode: "new" } | { mode: "copy"; from: RoleView } | { mode: "edit"; role: RoleView };

/** Roles are data (ADR-0011 §6): system roles are read-only templates to copy; the company's own are editable. */
export function RolesTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const roles = useAccessRoles();
  const [editing, setEditing] = useState<Editing | null>(null);
  const canManage = can(PERMISSIONS.ACCESS_MANAGE);

  const archive = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/access/roles/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("access.roles.archived"));
      return queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: () => toast.error(t("access.errors.failed")),
  });

  if (roles.isLoading) return <TableSkeleton />;
  if (roles.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      {canManage && (
        <div>
          <Button icon={<Plus />} onClick={() => setEditing({ mode: "new" })}>
            {t("access.roles.new")}
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {roles.data?.map((r) => (
          <Panel key={r.id} className={r.archived ? "opacity-60" : undefined}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-section">{roleName(i18n.language, r)}</h3>
                {(r.key || r.description) && (
                  <p className="mt-1 text-dense text-ink-muted">{r.key ? t(`access.systemRoles.${r.key}`) : r.description}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {r.isSystem && <Badge tone="neutral">{t("access.roles.system")}</Badge>}
                {r.isTemplate && <Badge tone="warning">{t("access.roles.template")}</Badge>}
                {r.archived && <Badge tone="danger">{t("access.roles.archivedBadge")}</Badge>}
              </div>
            </div>
            <p className="mt-3 text-meta text-ink-muted">
              {t("access.roles.holders", { count: r.holders })} · {t("access.roles.permissionsCount", { count: r.grants.length })}
            </p>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Copy />} onClick={() => setEditing({ mode: "copy", from: r })}>
                  {t("access.roles.copy")}
                </Button>
                {!r.isSystem && !r.archived && (
                  <>
                    <Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => setEditing({ mode: "edit", role: r })}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("access.roles.confirmArchive"))) archive.mutate(r.id);
                      }}
                    >
                      {t("access.roles.archive")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </Panel>
        ))}
      </div>
      {editing && (
        <RoleEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: accessKeys.roles })}
        />
      )}
    </div>
  );
}

function RoleEditor({ editing, onClose, onDone }: { editing: Editing; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const source = editing.mode === "edit" ? editing.role : editing.mode === "copy" ? editing.from : null;
  const [name, setName] = useState(
    editing.mode === "edit" ? editing.role.name : editing.mode === "copy" ? `${editing.from.name} (${t("access.roles.copySuffix")})` : "",
  );
  const [nameAr, setNameAr] = useState(editing.mode === "edit" ? (editing.role.nameAr ?? "") : editing.mode === "copy" && editing.from.nameAr ? `${editing.from.nameAr} (${t("access.roles.copySuffixAr")})` : "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [grants, setGrants] = useState<Record<string, RoleScope | "">>(Object.fromEntries((source?.grants ?? []).map((g) => [g.code, g.scope])));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        nameAr: nameAr.trim() || null,
        description: description.trim() || null,
        grants: Object.entries(grants)
          .filter(([, scope]) => scope !== "")
          .map(([code, scope]) => ({ code, scope })),
      };
      return editing.mode === "edit"
        ? apiJson(`/api/v1/access/roles/${editing.role.id}`, { method: "PATCH", ...jsonBody(body) })
        : apiJson("/api/v1/access/roles", { method: "POST", ...jsonBody(body) });
    },
    onSuccess: () => {
      toast.success(t("access.roles.saved"));
      onDone();
      onClose();
    },
    onError: (e) =>
      setError(
        t(
          e instanceof ApiError && e.code === "access.escalation"
            ? "access.errors.escalation"
            : e instanceof ApiError && e.code === "access.role.name_taken"
              ? "access.errors.nameTaken"
              : "access.errors.failed",
        ),
      ),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing.mode === "edit" ? t("access.roles.editTitle") : t("access.roles.newTitle")}</DialogTitle>
          <DialogDescription>{t("access.roles.editorHint")}</DialogDescription>
        </DialogHeader>
        <form
          id="role-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("access.roles.nameEn")} htmlFor="r-name">
              <Input id="r-name" dir="ltr" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("access.roles.nameAr")} htmlFor="r-name-ar">
              <Input id="r-name-ar" maxLength={80} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("access.roles.description")} htmlFor="r-desc">
                <Input id="r-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-panel border border-line p-3">
            {groupedPermissions().map((group) => (
              <div key={group.resource}>
                <h4 className="mb-2 text-meta font-semibold text-ink-muted">{t(`access.resources.${group.resource}`)}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.codes.map((code) => (
                    <label key={code} className="flex items-center justify-between gap-3 text-dense">
                      <span>{t(permissionKey(code))}</span>
                      <NativeSelect
                        aria-label={t(permissionKey(code))}
                        className="w-32"
                        value={grants[code] ?? ""}
                        onChange={(e) => setGrants((g) => ({ ...g, [code]: e.target.value as RoleScope | "" }))}
                      >
                        <option value="">{t("access.reach.none")}</option>
                        {ROLE_SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {t(`access.reach.${s}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {error && <Alert>{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="role-form" loading={save.isPending} disabled={name.trim() === ""}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
