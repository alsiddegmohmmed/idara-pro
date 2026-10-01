import { zodResolver } from "@hookform/resolvers/zod";
import { GENDERS, MARITAL_STATUSES, NATIONAL_ID_PATTERN, PERMISSIONS, PhoneSchema, isValidSaudiIban, normalizeDigits, normalizeIban } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toaster";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { useAuth } from "@/features/auth";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { countryOptions } from "@/lib/countries";
import type { Employee } from "@/lib/types";
import { REF_PERMISSION, employeesKey, useEmployee, useEmployees, useRefs } from "../api";
import { nameIn } from "../employee-name";
import { usePageCrumb } from "@/app/shell/crumb";

const optionalPhone = z.string().refine((v) => v.trim() === "" || PhoneSchema.safeParse(v).success, "phone");
const schema = z.object({
  // Assigned by the system on create (E-0001, …); shown read-only when editing.
  employeeNo: z.string(),
  fullNameAr: z.string().trim().min(1, "required"),
  fullNameEn: z.string().trim().min(1, "required"),
  // Also the employee's sign-in name: 10 digits starting with 1 (ID) or 2 (iqama). A masked value (no
  // personal-data permission) is never sent, so it isn't checked.
  nationalId: z
    .string()
    .trim()
    .min(1, "required")
    .refine((v) => v.startsWith("•") || NATIONAL_ID_PATTERN.test(normalizeDigits(v).replace(/[\s-]/g, "")), "nationalId"),
  nationality: z.string().min(1, "required"),
  gender: z.string(),
  birthDate: z.string(),
  maritalStatus: z.string(),
  phone: optionalPhone,
  additionalPhone: optionalPhone,
  personalEmail: z.string().refine((v) => v.trim() === "" || z.string().email().safeParse(v.trim()).success, "email"),
  jobTitle: z.string(),
  departmentId: z.string(),
  branchId: z.string(),
  scheduleId: z.string(),
  managerId: z.string(),
  hireDate: z.string().min(1, "required"),
  endDate: z.string(),
  status: z.enum(["active", "inactive"]),
  // Same check the API runs (packages/shared) — empty means "none".
  iban: z.string().refine((v) => v.trim() === "" || isValidSaudiIban(v), "iban"),
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

/**
 * `personal` is false when the user lacks employees:read-sensitive: the form then shows masked or empty
 * personal values, which must never be written back (the API refuses them too).
 */
function toPayload(v: Values, canSetIban: boolean, visible: VisibleRefs, personal: boolean, editing: boolean): Record<string, unknown> {
  return {
    fullNameAr: v.fullNameAr.trim(),
    fullNameEn: v.fullNameEn.trim(),
    // Required on create (the API needs it); on edit only with the personal-data permission.
    ...(personal || !editing ? { nationalId: v.nationalId.trim() } : {}),
    nationality: v.nationality,
    // Saudi / non-Saudi follows the nationality (national ID vs iqama, Saudization).
    isSaudi: v.nationality === "SA",
    gender: orNull(v.gender),
    jobTitle: orNull(v.jobTitle),
    ...(visible.department ? { departmentId: orNull(v.departmentId) } : {}),
    ...(visible.branch ? { branchId: orNull(v.branchId) } : {}),
    ...(visible.schedule ? { scheduleId: orNull(v.scheduleId) } : {}),
    ...(visible.manager ? { managerId: orNull(v.managerId) } : {}),
    hireDate: v.hireDate,
    endDate: orNull(v.endDate),
    status: v.status,
    ...(personal
      ? {
          birthDate: orNull(v.birthDate),
          maritalStatus: orNull(v.maritalStatus),
          phone: orNull(v.phone),
          additionalPhone: orNull(v.additionalPhone),
          personalEmail: orNull(v.personalEmail),
        }
      : {}),
    // HR-entered IBAN applies immediately; only sent when there's something to set.
    ...(canSetIban && v.iban.trim() !== "" ? { iban: normalizeIban(v.iban) } : {}),
  };
}

const SAVE_ERRORS: Record<string, string> = {
  "employees.invalid_date_range": "employees.form.dateRange",
  "employees.sensitive_permission_required": "employees.form.sensitiveDenied",
  "employees.branch_out_of_scope": "employees.form.branchDenied",
  "employees.transfer_forbidden": "employees.form.branchDenied",
};

export function EmployeeFormPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canSetIban = can(PERMISSIONS.EMPLOYEES_REVIEW);
  const personal = can(PERMISSIONS.EMPLOYEES_READ_SENSITIVE);
  const visible: VisibleRefs = {
    department: can(REF_PERMISSION.departments),
    branch: can(REF_PERMISSION.branches),
    schedule: can(REF_PERMISSION["work-schedules"]),
    manager: can(PERMISSIONS.EMPLOYEES_READ),
  };
  const [formError, setFormError] = useState<string | null>(null);
  const existing = useEmployee(id);
  // Links from elsewhere (e.g. a payroll "no IBAN" warning) say which field to fix: ?focus=iban.
  const [params] = useSearchParams();
  const focusField = params.get("focus");
  useEffect(() => {
    if (!focusField || (editing && !existing.data)) return;
    const el = document.getElementById(focusField);
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  }, [focusField, editing, existing.data]);
  usePageCrumb(editing ? (existing.data ? nameIn(i18n, existing.data) : null) : t("employees.add"));
  const departments = useRefs("departments");
  const branches = useRefs("branches");
  const schedules = useRefs("work-schedules");
  const others = useEmployees();
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeNo: "", fullNameAr: "", fullNameEn: "", nationalId: "", nationality: "SA", gender: "", birthDate: "", maritalStatus: "",
      phone: "", additionalPhone: "", personalEmail: "", jobTitle: "", departmentId: "", branchId: "", scheduleId: "", managerId: "",
      hireDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }), endDate: "", status: "active", iban: "",
    },
  });

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    reset({
      employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn, nationalId: e.nationalId,
      nationality: e.nationality, gender: blank(e.gender), birthDate: blank(e.birthDate?.slice(0, 10)), maritalStatus: blank(e.maritalStatus),
      phone: blank(e.phone), additionalPhone: blank(e.additionalPhone), personalEmail: blank(e.personalEmail),
      jobTitle: blank(e.jobTitle), departmentId: blank(e.departmentId), branchId: blank(e.branchId), scheduleId: blank(e.scheduleId),
      managerId: blank(e.managerId), hireDate: e.hireDate.slice(0, 10), endDate: blank(e.endDate?.slice(0, 10)), status: e.status, iban: "",
    });
  }, [existing.data, reset]);

  const nationality = watch("nationality");
  const countries = useMemo(
    () => countryOptions(i18n.language, t("employees.form.commonNationalities"), t("employees.form.allCountries")),
    [i18n.language, t],
  );
  const toOptions = (rows: Array<{ id: string; name: string }> | undefined): ComboboxOption[] => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  const managers = useMemo<ComboboxOption[]>(
    () =>
      (others.data ?? [])
        .filter((o) => o.id !== id)
        .map((o) => ({
          value: o.id,
          label: i18n.language === "ar" ? o.fullNameAr : o.fullNameEn,
          keywords: `${i18n.language === "ar" ? o.fullNameEn : o.fullNameAr} ${o.employeeNo}`,
        })),
    [others.data, id, i18n.language],
  );

  const save = useMutation({
    mutationFn: (v: Values) =>
      apiJson<Employee & { accessRestored?: boolean }>(editing ? `/api/v1/employees/${id}` : "/api/v1/employees", {
        method: editing ? "PATCH" : "POST",
        ...jsonBody(toPayload(v, canSetIban, visible, personal, editing)),
      }),
    onSuccess: async (saved) => {
      toast.success(editing ? t("common.changesSaved") : t("employees.form.created"));
      await queryClient.invalidateQueries({ queryKey: employeesKey });
      // Re-activated without restoring the login (no employees:manage-access): tell them on the next page.
      const notRestored =
        editing && existing.data?.status === "inactive" && saved.status === "active" && Boolean(saved.userId) && saved.accessRestored === false;
      navigate(`/employees/${saved.id}`, notRestored ? { state: { accessNotRestored: true } } : undefined);
    },
    onError: (error: Error) => {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "P2002" || /unique/i.test(error.message)) setFormError(t("employees.form.duplicate"));
      else setFormError(t(SAVE_ERRORS[code] ?? "employees.form.saveFailed"));
    },
  });

  /** A specific message per rule, not a generic "invalid". */
  const err = (key: keyof Values): string | undefined => {
    const m = errors[key]?.message;
    if (!m) return undefined;
    if (m === "phone") return t("employees.form.phoneInvalid");
    if (m === "email") return t("auth.login.invalidEmail");
    if (m === "iban") return t("employees.form.ibanInvalid");
    if (m === "nationalId") return t("employees.form.nationalIdInvalid");
    return t("employees.form.required");
  };
  const cancelTo = editing ? `/employees/${id}` : "/employees";

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
      noValidate
      className="mx-auto max-w-[760px]"
    >
      <PageHeader
        title={editing ? t("employees.form.editTitle") : t("employees.form.addTitle")}
        description={t("employees.form.description")}
      />
      <div className="space-y-6 pb-24">
        <Panel>
          <PanelHeader title={t("employees.sections.basic")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("employees.fields.fullNameAr")} htmlFor="fullNameAr" error={err("fullNameAr")} required>
              <Input id="fullNameAr" autoComplete="off" {...register("fullNameAr")} />
            </Field>
            <Field label={t("employees.fields.fullNameEn")} htmlFor="fullNameEn" error={err("fullNameEn")} required>
              <Input id="fullNameEn" dir="ltr" autoComplete="off" {...register("fullNameEn")} />
            </Field>
            <Field label={t("employees.fields.nationality")} htmlFor="nationality" error={err("nationality")} required>
              <Controller
                control={control}
                name="nationality"
                render={({ field }) => (
                  <Combobox
                    id="nationality"
                    value={field.value}
                    onChange={field.onChange}
                    options={countries}
                    searchPlaceholder={t("employees.form.searchCountry")}
                  />
                )}
              />
            </Field>
            <Field
              label={nationality === "SA" ? t("employees.fields.nationalIdSaudi") : t("employees.fields.iqama")}
              htmlFor="nationalId"
              error={err("nationalId")}
              hint={editing && !personal ? t("employees.form.maskedHint") : undefined}
              required
            >
              <Input id="nationalId" dir="ltr" inputMode="numeric" autoComplete="off" readOnly={editing && !personal} {...register("nationalId")} />
            </Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-meta font-medium text-ink">{t("employees.fields.gender")}</legend>
              <div className="flex h-10 items-center gap-6">
                {GENDERS.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-body">
                    <input type="radio" value={g} className="size-4 accent-[var(--primary)]" {...register("gender")} />
                    {t(`employees.gender.${g}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            {personal && (
              <>
                <Field label={t("employees.fields.birthDate")} htmlFor="birthDate">
                  <Input id="birthDate" type="date" dir="ltr" max={new Date().toISOString().slice(0, 10)} {...register("birthDate")} />
                </Field>
                <Field label={t("employees.fields.maritalStatus")} htmlFor="maritalStatus">
                  <NativeSelect id="maritalStatus" {...register("maritalStatus")}>
                    <option value="">—</option>
                    {MARITAL_STATUSES.map((m) => (
                      <option key={m} value={m}>
                        {t(`employees.marital.${m}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            )}
          </div>
        </Panel>

        {personal && (
          <Panel>
            <PanelHeader title={t("employees.sections.contact")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("employees.fields.phone")} htmlFor="phone" error={err("phone")} hint={t("employees.form.phoneHint")}>
                <Input id="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" placeholder="05XXXXXXXX" {...register("phone")} />
              </Field>
              <Field label={t("employees.fields.additionalPhone")} htmlFor="additionalPhone" error={err("additionalPhone")}>
                <Input id="additionalPhone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" {...register("additionalPhone")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("employees.fields.personalEmail")} htmlFor="personalEmail" error={err("personalEmail")}>
                  <Input id="personalEmail" type="email" dir="ltr" autoComplete="off" {...register("personalEmail")} />
                </Field>
              </div>
              <p className="text-meta text-ink-muted sm:col-span-2">{t("employees.form.contactsLater")}</p>
            </div>
          </Panel>
        )}

        <Panel>
          <PanelHeader title={t("employees.sections.job")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("employees.fields.employeeNo")} htmlFor="employeeNo" hint={editing ? undefined : t("employees.form.employeeNoAuto")}>
              <Input
                id="employeeNo"
                dir="ltr"
                readOnly
                className="bg-canvas"
                placeholder={editing ? undefined : t("employees.form.employeeNoPlaceholder")}
                {...register("employeeNo")}
              />
            </Field>
            <Field label={t("employees.fields.jobTitle")} htmlFor="jobTitle">
              <Input id="jobTitle" {...register("jobTitle")} />
            </Field>
            {visible.branch && (
              <Field label={t("employees.fields.branch")} htmlFor="branchId">
                <Controller
                  control={control}
                  name="branchId"
                  render={({ field }) => <Combobox id="branchId" value={field.value} onChange={field.onChange} options={toOptions(branches.data)} clearable />}
                />
              </Field>
            )}
            {visible.department && (
              <Field label={t("employees.fields.department")} htmlFor="departmentId">
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <Combobox id="departmentId" value={field.value} onChange={field.onChange} options={toOptions(departments.data)} clearable />
                  )}
                />
              </Field>
            )}
            {visible.manager && (
              <Field label={t("employees.fields.manager")} htmlFor="managerId">
                <Controller
                  control={control}
                  name="managerId"
                  render={({ field }) => (
                    <Combobox
                      id="managerId"
                      value={field.value}
                      onChange={field.onChange}
                      options={managers}
                      clearable
                      searchPlaceholder={t("employees.form.searchEmployee")}
                    />
                  )}
                />
              </Field>
            )}
            {visible.schedule && (
              <Field label={t("employees.fields.schedule")} htmlFor="scheduleId" hint={t("employees.form.scheduleHint")}>
                <Controller
                  control={control}
                  name="scheduleId"
                  render={({ field }) => (
                    <Combobox id="scheduleId" value={field.value} onChange={field.onChange} options={toOptions(schedules.data)} clearable />
                  )}
                />
              </Field>
            )}
            <Field label={t("employees.fields.hireDate")} htmlFor="hireDate" error={err("hireDate")} required>
              <Input id="hireDate" type="date" dir="ltr" {...register("hireDate")} />
            </Field>
            <Field label={t("employees.fields.endDate")} htmlFor="endDate" hint={t("employees.form.endDateHint")}>
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
              error={err("iban")}
            >
              <Input id="iban" dir="ltr" autoComplete="off" placeholder="SA00 0000 0000 0000 0000 0000" {...register("iban")} />
            </Field>
          </Panel>
        )}
        {formError && <Alert>{formError}</Alert>}
      </div>

      {/* Sticky footer bar (ui-spec §7.4). */}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[760px] flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
