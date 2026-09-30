import { PERMISSIONS } from "@idara-pro/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud, type Holiday } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

/** العطل الرسمية: not working days for attendance and leave day counts. */
export function HolidaysTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save, remove } = useCrud<Holiday>("holidays");
  const [editing, setEditing] = useState<Holiday | "new" | null>(null);
  const [form, setForm] = useState({ date: "", name: "", paid: true });
  const [error, setError] = useState<string | null>(null);
  const open = (h: Holiday | "new") => {
    setError(null);
    setEditing(h);
    setForm(h === "new" ? { date: "", name: "", paid: true } : { date: h.date.slice(0, 10), name: h.name, paid: h.paid });
  };
  const rows = [...(list.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <SetupTable
        rows={rows}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.ORG_MANAGE)}
        addLabel={t("setup.holidays.add")}
        onAdd={() => open("new")}
        onEdit={open}
        onDelete={(h) => remove.mutateAsync(h.id)}
        columns={[
          { header: t("setup.holidays.date"), cell: (h) => <bdi className="tabular-nums">{h.date.slice(0, 10)}</bdi> },
          { header: t("setup.holidays.name"), cell: (h) => <span className="font-medium">{h.name}</span> },
          { header: t("setup.holidays.paid"), cell: (h) => <Badge tone={h.paid ? "success" : "neutral"}>{h.paid ? t("setup.holidays.paidYes") : t("setup.holidays.paidNo")}</Badge> },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.holidays.add") : t("setup.holidays.edit")}
        formId="holiday-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={form.date !== "" && form.name.trim() !== ""}
        error={error}
        onSubmit={() =>
          save.mutate(
            { id: editing === "new" || editing === null ? undefined : editing.id, body: { date: form.date, name: form.name.trim(), paid: form.paid } },
            {
              onSuccess: () => {
                toast.success(t("setup.saved"));
                setEditing(null);
              },
              onError: (e) => setError(setupError(t, e)),
            },
          )
        }
      >
        <Field label={t("setup.holidays.date")} htmlFor="h-date">
          <Input id="h-date" type="date" dir="ltr" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label={t("setup.holidays.name")} htmlFor="h-name">
          <Input id="h-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-dense sm:col-span-2">
          <input type="checkbox" checked={form.paid} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))} />
          {t("setup.holidays.paidLabel")}
        </label>
      </FormDialog>
    </>
  );
}
