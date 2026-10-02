import { PERMISSIONS, type PositionView } from "@idara-pro/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud, type Department } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

/** المسميات الوظيفية (ux-redesign-v2 §5): one managed list, so one job has one spelling. */
export function PositionsTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save, remove } = useCrud<PositionView>("positions");
  const departments = useCrud<Department>("departments").list;
  const [editing, setEditing] = useState<PositionView | "new" | null>(null);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", departmentId: "" });
  const [error, setError] = useState<string | null>(null);
  const open = (p: PositionView | "new"): void => {
    setError(null);
    setEditing(p);
    setForm(p === "new" ? { nameAr: "", nameEn: "", departmentId: "" } : { nameAr: p.nameAr, nameEn: p.nameEn ?? "", departmentId: p.departmentId ?? "" });
  };
  const departmentName = (id: string | null): string => departments.data?.find((d) => d.id === id)?.name ?? "—";

  return (
    <>
      <p className="mb-4 text-dense text-ink-muted">{t("setup.positions.hint")}</p>
      <SetupTable
        rows={list.data}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.ORG_MANAGE)}
        addLabel={t("setup.positions.add")}
        onAdd={() => open("new")}
        onEdit={open}
        onDelete={(p) => remove.mutateAsync(p.id)}
        columns={[
          { header: t("setup.positions.nameAr"), cell: (p) => <span className="font-medium">{p.nameAr}</span> },
          { header: t("setup.positions.nameEn"), cell: (p) => (p.nameEn ? <bdi>{p.nameEn}</bdi> : "—") },
          { header: t("setup.positions.department"), cell: (p) => departmentName(p.departmentId) },
          { header: t("setup.positions.employees"), cell: (p) => <span className="tabular-nums">{p.employees}</span> },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.positions.add") : t("setup.positions.edit")}
        formId="position-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={form.nameAr.trim() !== ""}
        error={error}
        onSubmit={() =>
          save.mutate(
            {
              id: editing === "new" || editing === null ? undefined : editing.id,
              body: { nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim() || null, departmentId: form.departmentId || null },
            },
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
        <Field label={t("setup.positions.nameAr")} htmlFor="p-ar" required>
          <Input id="p-ar" required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
        </Field>
        <Field label={t("setup.positions.nameEn")} htmlFor="p-en">
          <Input id="p-en" dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        </Field>
        <Field label={t("setup.positions.department")} htmlFor="p-dept">
          <NativeSelect id="p-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">—</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormDialog>
    </>
  );
}
