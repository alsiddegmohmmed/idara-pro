import { CONTACT_RELATIONSHIPS, PhoneSchema, type ContactView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { apiJson, jsonBody } from "@/lib/api";
import { useFormCheck } from "@/lib/use-form-check";

type Form = { name: string; relationship: string; phone: string; isEmergency: boolean };
const empty: Form = { name: "", relationship: "", phone: "", isEmergency: false };

/**
 * Relatives and trusted contacts. `basePath` is /api/v1/employees/:id/contacts (HR) or /api/v1/me/contacts
 * (the employee themself). One emergency contact: marking another one moves the flag.
 */
export function ContactsPanel({ basePath, canEdit }: { basePath: string; canEdit: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["contacts", basePath], queryFn: () => apiJson<ContactView[]>(basePath) });
  const [editing, setEditing] = useState<ContactView | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const check = useFormCheck();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["contacts", basePath] });

  const open = (c: ContactView | "new") => {
    setEditing(c);
    check.reset();
    setError(null);
    setForm(c === "new" ? { ...empty, isEmergency: (list.data?.length ?? 0) === 0 } : { name: c.name, relationship: c.relationship, phone: c.phone, isEmergency: c.isEmergency });
  };
  const save = useMutation({
    mutationFn: () =>
      editing && editing !== "new"
        ? apiJson(`${basePath}/${editing.id}`, { method: "PATCH", ...jsonBody(form) })
        : apiJson(basePath, { method: "POST", ...jsonBody(form) }),
    onSuccess: async () => {
      toast.success(t("common.changesSaved"));
      setEditing(null);
      await refresh();
    },
    onError: () => setError(t("employees.contacts.failed")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`${basePath}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: () => toast.error(t("employees.contacts.failed")),
  });

  const nameError = check.submitted && form.name.trim() === "" ? t("employees.form.required") : undefined;
  const relError = check.submitted && form.relationship === "" ? t("employees.form.required") : undefined;
  const phoneError = check.submitted && !PhoneSchema.safeParse(form.phone).success ? t("employees.form.phoneInvalid") : undefined;

  return (
    <Panel>
      <PanelHeader
        title={t("employees.sections.contacts")}
        actions={
          canEdit && (
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => open("new")}>
              {t("employees.contacts.add")}
            </Button>
          )
        }
      />
      {list.isLoading && <Skeleton className="h-16" />}
      {list.isError && <Alert>{t("common.loadFailed")}</Alert>}
      {list.data?.length === 0 && <p className="text-body text-ink-muted">{t("employees.contacts.empty")}</p>}
      {list.data && list.data.length > 0 && (
        <ul className="divide-y divide-line">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {c.name}
                  {c.isEmergency && <Badge tone="danger">{t("employees.contacts.emergency")}</Badge>}
                </div>
                <div className="text-dense text-ink-muted">{t(`employees.contacts.relationships.${c.relationship}`)}</div>
              </div>
              <div className="flex items-center gap-1">
                <a href={`tel:${c.phone.replace(/[\s-]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-body hover:bg-canvas">
                  <Phone className="size-4 text-ink-muted" aria-hidden />
                  <bdi dir="ltr" className="tabular-nums">{c.phone}</bdi>
                </a>
                {canEdit && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label={t("common.edit")} onClick={() => open(c)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("common.delete")}
                      onClick={() => {
                        if (window.confirm(t("employees.contacts.confirmDelete"))) remove.mutate(c.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("employees.contacts.add") : t("employees.contacts.edit")}</DialogTitle>
          </DialogHeader>
          <form onBlur={check.onBlur}
            id="contact-form"
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (check.submit(Boolean(form.name.trim() && form.relationship && PhoneSchema.safeParse(form.phone).success))) save.mutate();
            }}
          >
            <Field label={t("employees.contacts.name")} htmlFor="c-name" error={nameError} required>
              <Input id="c-name" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label={t("employees.contacts.relationship")} htmlFor="c-rel" error={relError} required>
              <NativeSelect id="c-rel" value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}>
                <option value="">{t("common.choose")}</option>
                {CONTACT_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {t(`employees.contacts.relationships.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("employees.contacts.phone")} htmlFor="c-phone" error={phoneError} required>
              <Input id="c-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-body">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.isEmergency} onChange={(e) => setForm((f) => ({ ...f, isEmergency: e.target.checked }))} />
              {t("employees.contacts.markEmergency")}
            </label>
            {error && <Alert className="sm:col-span-2">{error}</Alert>}
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" form="contact-form" loading={save.isPending}>
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
