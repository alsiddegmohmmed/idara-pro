import { PERMISSIONS } from "@idara-pro/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud, type Department } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

/** الأقسام: shared by every branch; optional parent for sub-departments. */
export function DepartmentsTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save, remove } = useCrud<Department>("departments");
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = (d: Department | "new") => {
    setError(null);
    setEditing(d);
    setName(d === "new" ? "" : d.name);
    setParentId(d === "new" ? "" : (d.parentId ?? ""));
  };
  const parentName = (id: string | null) => list.data?.find((d) => d.id === id)?.name ?? "—";
  const editingId = editing === "new" || editing === null ? undefined : editing.id;

  return (
    <>
      <SetupTable
        rows={list.data}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.ORG_MANAGE)}
        addLabel={t("setup.departments.add")}
        onAdd={() => open("new")}
        onEdit={open}
        onDelete={(d) => remove.mutateAsync(d.id)}
        columns={[
          { header: t("setup.departments.name"), cell: (d) => <span className="font-medium">{d.name}</span> },
          { header: t("setup.departments.parent"), cell: (d) => parentName(d.parentId) },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.departments.add") : t("setup.departments.edit")}
        formId="department-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={name.trim() !== ""}
        error={error}
        onSubmit={() =>
          save.mutate(
            { id: editingId, body: { name: name.trim(), parentId: parentId || null } },
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
        <Field label={t("setup.departments.name")} htmlFor="d-name">
          <Input id="d-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("setup.departments.parent")} htmlFor="d-parent">
          <NativeSelect id="d-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">—</option>
            {list.data
              ?.filter((d) => d.id !== editingId)
              .map((d) => (
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
