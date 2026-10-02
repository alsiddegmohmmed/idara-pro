import { zodResolver } from "@hookform/resolvers/zod";
import { GENDERS, MARITAL_STATUSES, NATIONAL_ID_PATTERN, PERMISSIONS, PhoneSchema, isValidSaudiIban, normalizeDigits, normalizeIban, type PositionView } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { DatePicker, todayIso } from "@/components/ui/date-picker";

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
  positionId: z.string(),
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
    // The API writes the chosen title's name as the job-title snapshot; no title = none.
    positionId: orNull(v.positionId),
    ...(v.positionId ? {} : { jobTitle: null }),
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

/** Editing one section of the record (ux-redesign-v2 §4 "edit per section"): only its fields are shown and sent. */
const SECTIONS = ["basic", "contact", "job", "bank"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_FIELDS: Record<Section, string[]> = {
  basic: ["fullNameAr", "fullNameEn", "nationalId", "nationality", "isSaudi", "gender", "birthDate", "maritalStatus"],
  contact: ["phone", "additionalPhone", "personalEmail"],
  job: ["positionId", "jobTitle", "departmentId", "branchId", "scheduleId", "managerId", "hireDate", "endDate", "status"],
  bank: ["iban"],
};
const onlySection = (payload: Record<string, unknown>, section: Section | null): Record<string, unknown> =>
  section ? Object.fromEntries(Object.entries(payload).filter(([k]) => SECTION_FIELDS[section].includes(k))) : payload;

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
  // Adding: the required fields first (quick add); the rest is optional and can be filled later.
  const [more, setMore] = useState(false);
  const full = editing || more;
  const canInvite = !editing && can(PERMISSIONS.EMPLOYEES_INVITE);
  const [invite, setInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const inviteEmailOk = z.string().email().safeParse(inviteEmail.trim()).success;
  const existing = useEmployee(id);
  // Links from elsewhere (e.g. a payroll "no IBAN" warning) say which field to fix: ?focus=iban.
  const [params] = useSearchParams();
  const focusField = params.get("focus");
  const section: Section | null = editing ? (SECTIONS.find((x) => x === params.get("section")) ?? null) : null;
  const shows = (x: Section): boolean => section === null || section === x;
  // Back to the record tab the edit was opened from.
  const backTab = params.get("tab");
  const recordPath = `/employees/${id}${backTab ? `?tab=${backTab}` : ""}`;
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
  // Job titles are a managed list (ux-redesign-v2 §5); setup managers can add one from the picker.
  const positions = useQuery({ queryKey: ["positions"], queryFn: () => apiJson<PositionView[]>("/api/v1/positions"), enabled: can(PERMISSIONS.EMPLOYEES_READ) });
  const canAddTitle = can(PERMISSIONS.ORG_MANAGE);
  const addTitle = useMutation({
    mutationFn: (nameAr: string) => apiJson<PositionView>("/api/v1/positions", { method: "POST", ...jsonBody({ nameAr }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions"] }),
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      employeeNo: "", fullNameAr: "", fullNameEn: "", nationalId: "", nationality: "SA", gender: "", birthDate: "", maritalStatus: "",
      phone: "", additionalPhone: "", personalEmail: "", positionId: "", departmentId: "", branchId: "", scheduleId: "", managerId: "",
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
      positionId: blank(e.positionId), departmentId: blank(e.departmentId), branchId: blank(e.branchId), scheduleId: blank(e.scheduleId),
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
        ...jsonBody(onlySection(toPayload(v, canSetIban, visible, personal, editing), section)),
      }),
    onSuccess: async (saved) => {
      toast.success(editing ? t("common.changesSaved") : t("employees.form.created"));
      if (!editing && invite && inviteEmailOk) {
        // The record is saved either way; a failed invitation can be re-sent from the record.
        await apiJson(`/api/v1/employees/${saved.id}/invite`, { method: "POST", ...jsonBody({ email: inviteEmail.trim() }) }).then(
          () => toast.success(t("employees.invite.sent", { email: inviteEmail.trim() })),
          () => toast.error(t("employees.invite.failed")),
        );
      }
      await queryClient.invalidateQueries({ queryKey: employeesKey });
      // Re-activated without restoring the login (no employees:manage-access): tell them on the next page.
      const notRestored =
        editing && existing.data?.status === "inactive" && saved.status === "active" && Boolean(saved.userId) && saved.accessRestored === false;
      navigate(editing ? recordPath : `/employees/${saved.id}`, notRestored ? { state: { accessNotRestored: true } } : undefined);
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
  const cancelTo = editing ? recordPath : "/employees";

  return (
    <form
      onSubmit={handleSubmit(
        (v) => {
          setFormError(null);
          if (invite && !inviteEmailOk) {
            document.getElementById("invite-email")?.focus();
            return;
          }
          save.mutate(v);
        },
        // Editing one section: a problem in a field that isn't shown must still be said.
        () => section && setFormError(t("employees.form.otherSectionInvalid")),
      )}
      noValidate
      className="mx-auto max-w-[760px]"
    >
      <PageHeader
        title={section ? t("employees.form.editSection", { section: t(`employees.sections.${section}`) }) : editing ? t("employees.form.editTitle") : t("employees.form.addTitle")}
        description={editing ? t("employees.form.description") : t("employees.form.quickDescription")}
      />
      <div className="space-y-6 pb-24">
        {shows("basic") && (
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
            {full && (
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
            )}
            {full && personal && (
              <>
                <Field label={t("employees.fields.birthDate")} htmlFor="birthDate">
                  <Controller
                    name="birthDate"
                    control={control}
                    render={({ field }) => <DatePicker id="birthDate" value={field.value} onChange={field.onChange} max={todayIso()} clearable presets={[]} />}
                  />
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
        )}

        {full && personal && shows("contact") && (
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

        {shows("job") && (
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
            <Field label={t("employees.fields.jobTitle")} htmlFor="positionId" hint={canAddTitle ? t("employees.form.positionHint") : undefined}>
              <Controller
                control={control}
                name="positionId"
                render={({ field }) => (
                  <Combobox
                    id="positionId"
                    value={field.value}
                    onChange={field.onChange}
                    options={(positions.data ?? []).map((p) => ({ value: p.id, label: p.nameAr, keywords: p.nameEn ?? "" }))}
                    searchPlaceholder={t("employees.form.searchPosition")}
                    clearable
                    // ux-redesign-v2 §5: add a missing title right here instead of a detour to setup.
                    onCreate={
                      canAddTitle
                        ? (name) =>
                            void addTitle.mutateAsync(name).then(
                              (p) => field.onChange(p.id),
                              () => toast.error(t("employees.form.positionFailed")),
                            )
                        : undefined
                    }
                  />
                )}
              />
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
            {full && visible.department && (
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
            {full && visible.manager && (
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
            {full && visible.schedule && (
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
              <Controller
                name="hireDate"
                control={control}
                render={({ field }) => <DatePicker id="hireDate" value={field.value} onChange={field.onChange} aria-invalid={Boolean(errors.hireDate)} />}
              />
            </Field>
            {full && (
            <>
            <Field label={t("employees.fields.endDate")} htmlFor="endDate" hint={t("employees.form.endDateHint")}>
              <Controller
                name="endDate"
                control={control}
                render={({ field }) => <DatePicker id="endDate" value={field.value} onChange={field.onChange} clearable presets={[]} />}
              />
            </Field>
            <Field label={t("employees.fields.status")} htmlFor="status">
              <NativeSelect id="status" {...register("status")}>
                <option value="active">{t("employees.status.active")}</option>
                <option value="inactive">{t("employees.status.inactive")}</option>
              </NativeSelect>
            </Field>
            </>
            )}
          </div>
        </Panel>
        )}

        {!full && (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setMore(true)}>
            {t("employees.form.moreDetails")}
          </Button>
        )}

        {canInvite && (
          <Panel>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
              <span>
                <span className="block font-medium">{t("employees.form.sendInvite")}</span>
                <span className="block text-meta text-ink-muted">{t("employees.form.sendInviteHint")}</span>
              </span>
            </label>
            {invite && (
              <div className="mt-3">
                <Field
                  label={t("employees.invite.email")}
                  htmlFor="invite-email"
                  required
                  error={inviteEmail.trim() !== "" && !inviteEmailOk ? t("auth.login.invalidEmail") : undefined}
                >
                  <Input id="invite-email" type="email" dir="ltr" autoComplete="off" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} aria-invalid={!inviteEmailOk} />
                </Field>
              </div>
            )}
          </Panel>
        )}

        {full && canSetIban && shows("bank") && (
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
