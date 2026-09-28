import { zodResolver } from "@hookform/resolvers/zod";
import { PERMISSIONS, isValidSaudiIban, normalizeIban } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toaster";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { useAuth } from "@/features/auth";
import { apiJson, jsonBody } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { REF_PERMISSION, employeesKey, useEmployee, useEmployees, useRefs } from "../api";

const schema = z.object({
  employeeNo: z.string().min(1),
  fullNameAr: z.string().min(1),
  fullNameEn: z.string().min(1),
  nationalId: z.string().min(1),
  nationality: z.string().min(1),
  isSaudi: z.boolean(),
  jobTitle: z.string(),
  departmentId: z.string(),
  branchId: z.string(),
  scheduleId: z.string(),
  managerId: z.string(),
  hireDate: z.string().min(1),
  endDate: z.string(),
  status: z.enum(["active", "inactive"]),
  // Same check the API runs (packages/shared) — empty means "none".
  iban: z.string().refine((v) => v.trim() === "" || isValidSaudiIban(v), "invalid_iban"),
});
type Values = z.infer<typeof schema>;

const blank = (v: string | null | undefined): string => v ?? "";
const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** Reference fields whose options the user may read; hidden ones are left out of the payload so an edit never clears them. */
interface VisibleRefs {
  department: boolean;
  branch: boolean;
  schedule: boolean;
  manager: boolean;
}

function toPayload(v: Values, canSetIban: boolean, visible: VisibleRefs): Record<string, unknown> {
  return {
    employeeNo: v.employeeNo.trim(),
    fullNameAr: v.fullNameAr.trim(),
    fullNameEn: v.fullNameEn.trim(),
    nationalId: v.nationalId.trim(),
    nationality: v.nationality.trim(),
    isSaudi: v.isSaudi,
    jobTitle: orNull(v.jobTitle),
    ...(visible.department ? { departmentId: orNull(v.departmentId) } : {}),
    ...(visible.branch ? { branchId: orNull(v.branchId) } : {}),
    ...(visible.schedule ? { scheduleId: orNull(v.scheduleId) } : {}),
    ...(visible.manager ? { managerId: orNull(v.managerId) } : {}),
    hireDate: v.hireDate,
    endDate: orNull(v.endDate),
    status: v.status,
    // HR-entered IBAN applies immediately; only sent when there's something to set.
    ...(canSetIban && v.iban.trim() !== "" ? { iban: normalizeIban(v.iban) } : {}),
  };
}

export function EmployeeFormPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canSetIban = can(PERMISSIONS.EMPLOYEES_REVIEW);
  const visible: VisibleRefs = {
    department: can(REF_PERMISSION.departments),
    branch: can(REF_PERMISSION.branches),
    schedule: can(REF_PERMISSION["work-schedules"]),
    manager: can(PERMISSIONS.EMPLOYEES_READ),
  };
  const [formError, setFormError] = useState<string | null>(null);
  const existing = useEmployee(id);
  const departments = useRefs("departments");
  const branches = useRefs("branches");
  const schedules = useRefs("work-schedules");
  const others = useEmployees();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { isSaudi: true, status: "active", iban: "" } as Partial<Values>,
  });

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    reset({
      employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn, nationalId: e.nationalId,
      nationality: e.nationality, isSaudi: e.isSaudi, jobTitle: blank(e.jobTitle), departmentId: blank(e.departmentId),
      branchId: blank(e.branchId), scheduleId: blank(e.scheduleId), managerId: blank(e.managerId),
      hireDate: e.hireDate.slice(0, 10), endDate: blank(e.endDate?.slice(0, 10)), status: e.status, iban: "",
    });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      apiJson<Employee & { accessRestored?: boolean }>(editing ? `/api/v1/employees/${id}` : "/api/v1/employees", {
        method: editing ? "PATCH" : "POST",
        ...jsonBody(toPayload(v, canSetIban, visible)),
      }),
    onSuccess: async (saved) => {
      toast.success(editing ? t("common.changesSaved") : t("employees.form.created"));
      await queryClient.invalidateQueries({ queryKey: employeesKey });
      // Re-activated without restoring the login (no employees:manage-access): tell them on the next page.
      const notRestored =
        editing && existing.data?.status === "inactive" && saved.status === "active" && Boolean(saved.userId) && saved.accessRestored === false;
      navigate(`/employees/${saved.id}`, notRestored ? { state: { accessNotRestored: true } } : undefined);
    },
    onError: (error: Error & { code?: string }) => {
      setFormError(
        error.code === "employees.invalid_date_range" ? t("employees.form.dateRange") : t("employees.form.saveFailed"),
      );
    },
  });

  const err = (key: keyof Values): string | undefined => (errors[key] ? t("employees.form.required") : undefined);
  const nameOf = (e: { fullNameAr: string; fullNameEn: string }): string => (i18n.language === "ar" ? e.fullNameAr : e.fullNameEn);
  const cancelTo = editing ? `/employees/${id}` : "/employees";

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
      noValidate
      className="mx-auto max-w-[720px]"
    >
      <PageHeader
        title={editing ? t("employees.form.editTitle") : t("employees.form.addTitle")}
        description={t("employees.form.description")}
      />
      <div className="space-y-6 pb-24">
        <Panel>
          <PanelHeader title={t("employees.sections.personal")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("employees.fields.fullNameAr")} htmlFor="fullNameAr" error={err("fullNameAr")}>
              <Input id="fullNameAr" {...register("fullNameAr")} />
            </Field>
            <Field label={t("employees.fields.fullNameEn")} htmlFor="fullNameEn" error={err("fullNameEn")}>
              <Input id="fullNameEn" dir="ltr" {...register("fullNameEn")} />
            </Field>
            <Field label={t("employees.fields.nationalId")} htmlFor="nationalId" error={err("nationalId")} hint={t("employees.form.nationalIdHint")}>
              <Input id="nationalId" dir="ltr" {...register("nationalId")} />
            </Field>
            <Field label={t("employees.fields.nationality")} htmlFor="nationality" error={err("nationality")}>
              <Input id="nationality" {...register("nationality")} />
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-body sm:col-span-2">
              <input type="checkbox" className="size-5 rounded border-line-strong accent-[var(--primary)]" {...register("isSaudi")} />
              {t("employees.fields.isSaudi")}
            </label>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={t("employees.sections.job")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("employees.fields.employeeNo")} htmlFor="employeeNo" error={err("employeeNo")}>
              <Input id="employeeNo" dir="ltr" {...register("employeeNo")} />
            </Field>
            <Field label={t("employees.fields.jobTitle")} htmlFor="jobTitle">
              <Input id="jobTitle" {...register("jobTitle")} />
            </Field>
            {visible.department && (
            <Field label={t("employees.fields.department")} htmlFor="departmentId">
              <NativeSelect id="departmentId" {...register("departmentId")}>
                <option value="">—</option>
                {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </NativeSelect>
            </Field>
            )}
            {visible.branch && (
            <Field label={t("employees.fields.branch")} htmlFor="branchId">
              <NativeSelect id="branchId" {...register("branchId")}>
                <option value="">—</option>
                {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </NativeSelect>
            </Field>
            )}
            {visible.manager && (
            <Field label={t("employees.fields.manager")} htmlFor="managerId">
              <NativeSelect id="managerId" {...register("managerId")}>
                <option value="">—</option>
                {others.data?.filter((o) => o.id !== id).map((o) => <option key={o.id} value={o.id}>{nameOf(o)}</option>)}
              </NativeSelect>
            </Field>
            )}
            {visible.schedule && (
            <Field label={t("employees.fields.schedule")} htmlFor="scheduleId">
              <NativeSelect id="scheduleId" {...register("scheduleId")}>
                <option value="">—</option>
                {schedules.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            )}
            <Field label={t("employees.fields.hireDate")} htmlFor="hireDate" error={err("hireDate")}>
              <Input id="hireDate" type="date" dir="ltr" {...register("hireDate")} />
            </Field>
            <Field label={t("employees.fields.endDate")} htmlFor="endDate">
              <Input id="endDate" type="date" dir="ltr" {...register("endDate")} />
            </Field>
            <Field label={t("employees.fields.status")} htmlFor="status">
              <NativeSelect id="status" {...register("status")}>
                <option value="active">{t("employees.status.active")}</option>
                <option value="inactive">{t("employees.status.inactive")}</option>
              </NativeSelect>
            </Field>
          </div>
        </Panel>

        {canSetIban && (
          <Panel>
            <PanelHeader title={t("employees.sections.bank")} />
            <Field
              label={t("employees.fields.iban")}
              htmlFor="iban"
              hint={editing ? t("employees.form.ibanEditHint") : t("employees.form.ibanHint")}
              error={errors.iban ? t("employees.form.ibanInvalid") : undefined}
            >
              <Input id="iban" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" {...register("iban")} />
            </Field>
          </Panel>
        )}
        {formError && <Alert>{formError}</Alert>}
      </div>

      {/* Sticky footer bar (ui-spec §7.4). */}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[720px] flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" asChild>
            <Link to={cancelTo}>{t("common.cancel")}</Link>
          </Button>
          <Button type="submit" loading={isSubmitting || save.isPending} size="lg" className="sm:h-10">
            {editing ? t("common.saveChanges") : t("employees.form.create")}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog when={isDirty && !save.isPending && !save.isSuccess} />
    </form>
  );
}

/** Warns before leaving with unsaved changes: in-app navigation (dialog) and tab close/reload (browser prompt). */
function UnsavedChangesDialog({ when }: { when: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);
  return (
    <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("employees.form.unsavedTitle")}</DialogTitle>
          <DialogDescription>{t("employees.form.unsavedBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            {t("employees.form.keepEditing")}
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            {t("employees.form.discard")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
