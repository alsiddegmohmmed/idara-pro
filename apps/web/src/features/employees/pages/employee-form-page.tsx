import { zodResolver } from "@hookform/resolvers/zod";
import { PERMISSIONS, isValidSaudiIban, normalizeIban } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useAuth } from "@/features/auth";
import { apiJson, jsonBody } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { employeesKey, useEmployee, useEmployees, useRefs } from "../api";

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

function toPayload(v: Values, canSetIban: boolean): Record<string, unknown> {
  return {
    employeeNo: v.employeeNo.trim(),
    fullNameAr: v.fullNameAr.trim(),
    fullNameEn: v.fullNameEn.trim(),
    nationalId: v.nationalId.trim(),
    nationality: v.nationality.trim(),
    isSaudi: v.isSaudi,
    jobTitle: orNull(v.jobTitle),
    departmentId: orNull(v.departmentId),
    branchId: orNull(v.branchId),
    scheduleId: orNull(v.scheduleId),
    managerId: orNull(v.managerId),
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
    formState: { errors, isSubmitting },
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
      apiJson<Employee>(editing ? `/api/v1/employees/${id}` : "/api/v1/employees", {
        method: editing ? "PATCH" : "POST",
        ...jsonBody(toPayload(v, canSetIban)),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: employeesKey });
      navigate(`/employees/${saved.id}`);
    },
    onError: (error: Error & { code?: string }) => {
      setFormError(
        error.code === "employees.invalid_date_range" ? t("employees.form.dateRange") : t("employees.form.saveFailed"),
      );
    },
  });

  const err = (key: keyof Values): string | undefined => (errors[key] ? t("employees.form.required") : undefined);
  const nameOf = (e: { fullNameAr: string; fullNameEn: string }): string => (i18n.language === "ar" ? e.fullNameAr : e.fullNameEn);

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
      className="space-y-4"
    >
      <h1 className="text-2xl font-semibold">{editing ? t("employees.form.editTitle") : t("employees.form.addTitle")}</h1>
      <Card className="grid gap-4 md:grid-cols-2">
        <Field label={t("employees.fields.employeeNo")} htmlFor="employeeNo" error={err("employeeNo")}>
          <Input id="employeeNo" dir="ltr" {...register("employeeNo")} />
        </Field>
        <Field label={t("employees.fields.nationalId")} htmlFor="nationalId" error={err("nationalId")} hint={t("employees.form.nationalIdHint")}>
          <Input id="nationalId" dir="ltr" {...register("nationalId")} />
        </Field>
        <Field label={t("employees.fields.fullNameAr")} htmlFor="fullNameAr" error={err("fullNameAr")}>
          <Input id="fullNameAr" {...register("fullNameAr")} />
        </Field>
        <Field label={t("employees.fields.fullNameEn")} htmlFor="fullNameEn" error={err("fullNameEn")}>
          <Input id="fullNameEn" dir="ltr" {...register("fullNameEn")} />
        </Field>
        <Field label={t("employees.fields.nationality")} htmlFor="nationality" error={err("nationality")}>
          <Input id="nationality" {...register("nationality")} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" {...register("isSaudi")} /> {t("employees.fields.isSaudi")}
        </label>
        <Field label={t("employees.fields.jobTitle")} htmlFor="jobTitle">
          <Input id="jobTitle" {...register("jobTitle")} />
        </Field>
        <Field label={t("employees.fields.status")} htmlFor="status">
          <Select id="status" {...register("status")}>
            <option value="active">{t("employees.status.active")}</option>
            <option value="inactive">{t("employees.status.inactive")}</option>
          </Select>
        </Field>
        <Field label={t("employees.fields.hireDate")} htmlFor="hireDate" error={err("hireDate")}>
          <Input id="hireDate" type="date" dir="ltr" {...register("hireDate")} />
        </Field>
        <Field label={t("employees.fields.endDate")} htmlFor="endDate">
          <Input id="endDate" type="date" dir="ltr" {...register("endDate")} />
        </Field>
        <Field label={t("employees.fields.department")} htmlFor="departmentId">
          <Select id="departmentId" {...register("departmentId")}>
            <option value="">—</option>
            {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.fields.branch")} htmlFor="branchId">
          <Select id="branchId" {...register("branchId")}>
            <option value="">—</option>
            {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.fields.schedule")} htmlFor="scheduleId">
          <Select id="scheduleId" {...register("scheduleId")}>
            <option value="">—</option>
            {schedules.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.fields.manager")} htmlFor="managerId">
          <Select id="managerId" {...register("managerId")}>
            <option value="">—</option>
            {others.data?.filter((o) => o.id !== id).map((o) => <option key={o.id} value={o.id}>{nameOf(o)}</option>)}
          </Select>
        </Field>
        {canSetIban && (
          <Field
            label={t("employees.fields.iban")}
            htmlFor="iban"
            hint={editing ? t("employees.form.ibanEditHint") : t("employees.form.ibanHint")}
            error={errors.iban ? t("employees.form.ibanInvalid") : undefined}
          >
            <Input id="iban" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" {...register("iban")} />
          </Field>
        )}
      </Card>
      {formError && <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{formError}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || save.isPending}>{t("common.save")}</Button>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}
