import { PERMISSIONS, type InsurancePolicyView } from "@idara-pro/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

const empty = { provider: "", policyNumber: "", startDate: "", endDate: "", notes: "" };
const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** Company medical insurance policies; employees are enrolled from their own page. Kept for history (no delete). */
export function InsurancePoliciesTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save } = useCrud<InsurancePolicyView>("insurance-policies");
  const [editing, setEditing] = useState<InsurancePolicyView | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const open = (p: InsurancePolicyView | "new") => {
    setError(null);
    setEditing(p);
    setForm(p === "new" ? empty : { provider: p.provider, policyNumber: p.policyNumber, startDate: p.startDate, endDate: p.endDate, notes: p.notes ?? "" });
  };
  const valid = form.provider.trim() !== "" && form.policyNumber.trim() !== "" && form.startDate !== "" && form.endDate >= form.startDate;

  return (
    <>
      <SetupTable
        rows={list.data}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.INSURANCE_MANAGE)}
        addLabel={t("setup.insurance.add")}
        onAdd={() => open("new")}
        onEdit={open}
        columns={[
          { header: t("setup.insurance.provider"), cell: (p) => <span className="font-medium">{p.provider}</span> },
          { header: t("setup.insurance.number"), cell: (p) => <bdi dir="ltr">{p.policyNumber}</bdi> },
          {
            header: t("setup.insurance.period"),
            cell: (p) => (
              <>
                <bdi dir="ltr" className="tabular-nums">{p.startDate} → {p.endDate}</bdi>
                {p.endDate < today() && <Badge tone="danger" className="ms-2">{t("employees.insurance.expired")}</Badge>}
              </>
            ),
          },
          { header: t("setup.insurance.members"), cell: (p) => <span className="tabular-nums">{p.members}</span> },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.insurance.add") : t("setup.insurance.edit")}
        formId="policy-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={valid}
        error={error}
        onSubmit={() =>
          save.mutate(
            {
              id: editing === "new" || editing === null ? undefined : editing.id,
              body: { provider: form.provider.trim(), policyNumber: form.policyNumber.trim(), startDate: form.startDate, endDate: form.endDate, notes: form.notes.trim() || null },
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
        <Field label={t("setup.insurance.provider")} htmlFor="ip-provider" required>
          <Input id="ip-provider" value={form.provider} onChange={set("provider")} />
        </Field>
        <Field label={t("setup.insurance.number")} htmlFor="ip-number" required>
          <Input id="ip-number" dir="ltr" value={form.policyNumber} onChange={set("policyNumber")} />
        </Field>
        <Field label={t("setup.insurance.start")} htmlFor="ip-start" required>
          <Input id="ip-start" type="date" dir="ltr" value={form.startDate} onChange={set("startDate")} />
        </Field>
        <Field label={t("setup.insurance.end")} htmlFor="ip-end" required>
          <Input id="ip-end" type="date" dir="ltr" min={form.startDate} value={form.endDate} onChange={set("endDate")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("setup.insurance.notes")} htmlFor="ip-notes">
            <Input id="ip-notes" value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
