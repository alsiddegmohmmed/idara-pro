import { PERMISSIONS } from "@idara-pro/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud, type WorkSchedule } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const; // JS getDay(): 0 = Sunday
const empty = { name: "", startTime: "08:00", endTime: "17:00", lateGraceMin: "15", workDays: [0, 1, 2, 3, 4] as number[] };

/** جداول الدوام: start/end time, late grace and working days — attendance judges lateness by these. */
export function SchedulesTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save, remove } = useCrud<WorkSchedule>("work-schedules");
  const [editing, setEditing] = useState<WorkSchedule | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  const open = (s: WorkSchedule | "new") => {
    setError(null);
    setEditing(s);
    setForm(s === "new" ? empty : { name: s.name, startTime: s.startTime, endTime: s.endTime, lateGraceMin: String(s.lateGraceMin), workDays: s.workDays });
  };
  const grace = Number(form.lateGraceMin);
  const valid = form.name.trim() !== "" && Number.isInteger(grace) && grace >= 0 && form.workDays.length > 0;
  const days = (d: number[]) => [...d].sort().map((x) => t(`setup.days.${x}`)).join("، ");

  return (
    <>
      <SetupTable
        rows={list.data}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.ORG_MANAGE)}
        addLabel={t("setup.schedules.add")}
        onAdd={() => open("new")}
        onEdit={open}
        onDelete={(s) => remove.mutateAsync(s.id)}
        columns={[
          { header: t("setup.schedules.name"), cell: (s) => <span className="font-medium">{s.name}</span> },
          { header: t("setup.schedules.hours"), cell: (s) => <bdi dir="ltr" className="tabular-nums">{s.startTime} – {s.endTime}</bdi> },
          { header: t("setup.schedules.grace"), cell: (s) => t("setup.schedules.minutes", { count: s.lateGraceMin }) },
          { header: t("setup.schedules.workDays"), cell: (s) => days(s.workDays) },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.schedules.add") : t("setup.schedules.edit")}
        formId="schedule-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={valid}
        error={error}
        onSubmit={() =>
          save.mutate(
            {
              id: editing === "new" || editing === null ? undefined : editing.id,
              body: { name: form.name.trim(), startTime: form.startTime, endTime: form.endTime, lateGraceMin: grace, workDays: form.workDays },
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
        <div className="sm:col-span-2">
          <Field label={t("setup.schedules.name")} htmlFor="s-name">
            <Input id="s-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
        </div>
        <Field label={t("setup.schedules.start")} htmlFor="s-start">
          <Input id="s-start" type="time" dir="ltr" required value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
        </Field>
        <Field label={t("setup.schedules.end")} htmlFor="s-end">
          <Input id="s-end" type="time" dir="ltr" required value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
        </Field>
        <Field label={t("setup.schedules.grace")} htmlFor="s-grace" hint={t("setup.schedules.graceHint")}>
          <Input id="s-grace" dir="ltr" inputMode="numeric" value={form.lateGraceMin} onChange={(e) => setForm((f) => ({ ...f, lateGraceMin: e.target.value }))} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-meta font-medium text-ink">{t("setup.schedules.workDays")}</legend>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-dense">
                <input
                  type="checkbox"
                  checked={form.workDays.includes(d)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, workDays: e.target.checked ? [...f.workDays, d] : f.workDays.filter((x) => x !== d) }))
                  }
                />
                {t(`setup.days.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </FormDialog>
    </>
  );
}
