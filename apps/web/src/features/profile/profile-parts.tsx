import { zodResolver } from "@hookform/resolvers/zod";
import { MyProfileUpdateSchema, PhoneSchema, isValidSaudiIban, type ContractView, type MyWorkplaceView } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Eye, EyeOff, Lock, Pencil } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { nameIn } from "@/features/employees/employee-name";
import { MaskedValue } from "@/features/employees/record-header";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { countryName } from "@/lib/countries";
import { formatHalalas } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Employee, SalaryComponent } from "@/lib/types";

// ملفي الشخصي: view first, edit one card at a time. Cards are plain white panels with a title row;
// HR-owned facts carry a lock note instead of an edit button.

/** A profile card: title, optional action at the inline-end, body. */
export function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <section className={cn("rounded-panel border border-line bg-surface", className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-subsection text-ink">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EditButton({ onClick, label }: { onClick: () => void; label: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" icon={<Pencil />} onClick={onClick} aria-label={label}>
      {t("common.edit")}
    </Button>
  );
}

/** "Managed by HR" — shown where the employee can read but not change. */
export function HrOwned(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-meta text-ink-muted">
      <Lock className="size-3.5" aria-hidden />
      {t("profile.hrOwned")}
    </span>
  );
}

/** Label/value rows in a two-column grid; empty values read "لم يُضف". */
export function Facts({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode } | null>; columns?: 1 | 2 }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <dl className={cn("grid gap-x-6 gap-y-5", columns === 2 && "grid-cols-2")}>
      {items.filter((x): x is { label: string; value: ReactNode } => x !== null).map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-meta text-ink-muted">{f.label}</dt>
          <dd className="mt-1 break-words text-body text-ink">
            {f.value === null || f.value === undefined || f.value === "" ? <span className="text-ink-muted">{t("profile.notAdded")}</span> : f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Sunday–Thursday style range when the days are consecutive, else the list. */
export function workDaysText(days: number[], language: string): string {
  const fmt = new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", { weekday: "long", timeZone: "UTC" });
  // 2024-01-07 was a Sunday (getDay() = 0).
  const name = (d: number): string => fmt.format(new Date(Date.UTC(2024, 0, 7 + d)));
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const consecutive = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] ?? 0) + 1);
  const first = sorted[0] ?? 0;
  const last = sorted[sorted.length - 1] ?? 0;
  if (consecutive && sorted.length > 2) return `${name(first)} – ${name(last)}`;
  return sorted.map(name).join("، ");
}

// ---------------- job ----------------

export function JobCard({ e, workplace, tenure, contract }: { e: Employee; workplace?: MyWorkplaceView; tenure: string; contract?: ContractView }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const m = workplace?.manager;
  return (
    <Card title={t("profile.job.title")} action={<HrOwned />}>
      <Facts
        items={[
          { label: t("employees.fields.jobTitle"), value: e.jobTitle },
          { label: t("employees.fields.department"), value: workplace?.department },
          { label: t("employees.fields.branch"), value: workplace?.branch },
          {
            label: t("employees.fields.hireDate"),
            value: (
              <>
                <bdi className="tabular-nums">{e.hireDate.slice(0, 10)}</bdi> <span className="text-ink-muted">· {tenure}</span>
              </>
            ),
          },
          {
            label: t("profile.job.hours"),
            value: workplace?.schedule && (
              <>
                <bdi dir="ltr" className="tabular-nums">
                  {workplace.schedule.startTime} – {workplace.schedule.endTime}
                </bdi>
                <span className="block text-dense text-ink-muted">{workDaysText(workplace.schedule.workDays, i18n.language)}</span>
              </>
            ),
          },
          {
            label: t("profile.job.contract"),
            value: contract && (
              <>
                {t(`employees.contracts.types.${contract.type}`)}
                {contract.endDate && <span className="block text-dense text-ink-muted">{t("profile.job.until", { date: contract.endDate.slice(0, 10) })}</span>}
              </>
            ),
          },
        ]}
      />
      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-meta text-ink-muted">{t("employees.fields.manager")}</p>
        {m ? (
          <div className="flex items-center gap-3">
            <Avatar name={m.fullNameAr} size="md" />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-ink">{nameIn(i18n, m)}</p>
              {m.jobTitle && <p className="truncate text-dense text-ink-muted">{m.jobTitle}</p>}
            </div>
          </div>
        ) : (
          <p className="text-body text-ink-muted">{t("profile.notAdded")}</p>
        )}
      </div>
    </Card>
  );
}

// ---------------- personal ----------------

export function BasicInfoCard({ e }: { e: Employee }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <Card title={t("employees.sections.basic")} action={<HrOwned />}>
      <Facts
        items={[
          { label: t("employees.fields.fullNameAr"), value: e.fullNameAr },
          { label: t("employees.fields.fullNameEn"), value: <bdi>{e.fullNameEn}</bdi> },
          { label: e.isSaudi ? t("employees.fields.nationalIdSaudi") : t("employees.fields.iqama"), value: <MaskedValue value={e.nationalId} /> },
          { label: t("employees.fields.nationality"), value: countryName(e.nationality, i18n.language) },
          { label: t("employees.fields.gender"), value: e.gender && t(`employees.gender.${e.gender}`) },
          { label: t("employees.fields.birthDate"), value: e.birthDate && <bdi className="tabular-nums">{e.birthDate.slice(0, 10)}</bdi> },
          { label: t("employees.fields.maritalStatus"), value: e.maritalStatus && t(`employees.marital.${e.maritalStatus}`) },
          { label: t("employees.fields.employeeNo"), value: <bdi>{e.employeeNo}</bdi> },
        ]}
      />
      <p className="mt-5 border-t border-line pt-4 text-dense text-ink-muted">{t("profile.hrFields.note")}</p>
    </Card>
  );
}

const phone = z.string().refine((v) => v.trim() === "" || PhoneSchema.safeParse(v).success, "phone");
const contactSchema = z.object({
  phone,
  additionalPhone: phone,
  personalEmail: z.string().refine((v) => v === "" || z.string().email().safeParse(v).success, "email"),
  address: z.string(),
});
type ContactValues = z.infer<typeof contactSchema>;
const nullIfEmpty = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** بيانات التواصل: shown as facts; "تعديل" turns the card into its form (saved at once, no review). */
export function ContactCard({ me, editing, onEditing, narrow = false }: { me: Employee; editing: boolean; onEditing: (v: boolean) => void; narrow?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<ContactValues>({ mode: "onTouched", resolver: zodResolver(contactSchema) });
  useEffect(() => {
    reset({ phone: me.phone ?? "", additionalPhone: me.additionalPhone ?? "", personalEmail: me.personalEmail ?? "", address: me.address ?? "" });
  }, [me, reset, editing]);
  useEffect(() => {
    if (editing) setFocus("phone");
  }, [editing, setFocus]);
  const save = useMutation({
    mutationFn: (v: ContactValues) =>
      apiJson<Employee>("/api/v1/me/profile", {
        method: "PATCH",
        // Validated with the same schema the API uses.
        ...jsonBody(
          MyProfileUpdateSchema.parse({
            phone: nullIfEmpty(v.phone),
            additionalPhone: nullIfEmpty(v.additionalPhone),
            personalEmail: nullIfEmpty(v.personalEmail),
            address: nullIfEmpty(v.address),
          }),
        ),
      }),
    onSuccess: async () => {
      toast.success(t("common.changesSaved"));
      onEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const title = t("employees.sections.contact");
  if (!editing) {
    return (
      <Card title={title} action={<EditButton onClick={() => onEditing(true)} label={t("employees.rail.editSection", { section: title })} />}>
        <Facts
          columns={narrow ? 1 : 2}
          items={[
            { label: t("employees.fields.phone"), value: me.phone && <bdi dir="ltr" className="tabular-nums">{me.phone}</bdi> },
            { label: t("employees.fields.additionalPhone"), value: me.additionalPhone && <bdi dir="ltr" className="tabular-nums">{me.additionalPhone}</bdi> },
            { label: t("employees.fields.personalEmail"), value: me.personalEmail && <bdi>{me.personalEmail}</bdi> },
            { label: t("employees.fields.address"), value: me.address },
          ]}
        />
      </Card>
    );
  }
  return (
    <Card title={title}>
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Field label={t("employees.fields.phone")} htmlFor="phone" error={errors.phone ? t("employees.form.phoneInvalid") : undefined}>
          <Input id="phone" type="tel" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" {...register("phone")} />
        </Field>
        <Field label={t("employees.fields.additionalPhone")} htmlFor="additionalPhone" error={errors.additionalPhone ? t("employees.form.phoneInvalid") : undefined}>
          <Input id="additionalPhone" type="tel" dir="ltr" inputMode="tel" {...register("additionalPhone")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("employees.fields.personalEmail")} htmlFor="personalEmail" error={errors.personalEmail ? t("auth.login.invalidEmail") : undefined}>
            <Input id="personalEmail" type="email" dir="ltr" {...register("personalEmail")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("employees.fields.address")} htmlFor="address">
            <Textarea id="address" rows={2} maxLength={300} {...register("address")} />
          </Field>
        </div>
        {save.isError && <Alert className="sm:col-span-2">{t("employees.form.saveFailed")}</Alert>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={save.isPending}>
            {t("common.saveChanges")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onEditing(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------- pay ----------------

const COMPONENT_ORDER: SalaryComponent["type"][] = ["basic", "housing", "transport", "other"];

/** The monthly salary, hidden until the eye is pressed (people open their profile in front of others). */
export function SalaryCard({ components }: { components: SalaryComponent[] | undefined }): React.JSX.Element {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const rows = [...(components ?? [])].sort((a, b) => COMPONENT_ORDER.indexOf(a.type) - COMPONENT_ORDER.indexOf(b.type));
  const total = rows.reduce((sum, c) => sum + BigInt(c.amountHalalas), 0n);
  const money = (halalas: string): ReactNode =>
    shown ? (
      <>
        <bdi className="tabular-nums">{formatHalalas(halalas)}</bdi> <span className="text-ink-muted">{t("employees.salary.sar")}</span>
      </>
    ) : (
      <span aria-label={t("profile.pay.hidden")} className="tracking-widest text-ink-muted">
        ••••••
      </span>
    );
  return (
    <Card
      title={t("profile.pay.monthly")}
      action={
        <Button variant="ghost" size="sm" icon={shown ? <EyeOff /> : <Eye />} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
          {shown ? t("profile.pay.hide") : t("profile.pay.show")}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-body text-ink-muted">{t("employees.salary.empty")}</p>
      ) : (
        <>
          <p className="text-meta text-ink-muted">{t("profile.pay.total")}</p>
          <p className="mt-1 text-page-title text-ink">{money(total.toString())}</p>
          <dl className="mt-5 divide-y divide-line border-t border-line">
            {rows.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 py-3 text-body">
                <dt className="text-ink-muted">{t(`employees.salary.types.${c.type}`)}</dt>
                <dd className="text-ink">{money(c.amountHalalas)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <Link to="/payslips" className="mt-4 inline-flex items-center gap-1 text-dense font-medium text-primary underline-offset-4 hover:underline">
        {t("profile.pay.payslips")}
        <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
      </Link>
    </Card>
  );
}

/** الحساب البنكي: the approved IBAN, a pending one, and "تغيير الآيبان" (reviewed by HR before it applies). */
export function IbanCard({ me, editing, onEditing }: { me: Employee; editing: boolean; onEditing: (v: boolean) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = useMutation({
    mutationFn: () => apiJson<Employee>("/api/v1/me/iban", { method: "POST", ...jsonBody({ iban: value }) }),
    onSuccess: async () => {
      setValue("");
      onEditing(false);
      toast.success(t("profile.iban.submitted"));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.status === 400) setInvalid(true);
      else toast.error(t("review.failed"));
    },
  });
  const pending = me.ibanReviewStatus === "pending_review";
  return (
    <Card
      title={t("employees.sections.bank")}
      action={
        !editing && (
          <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => onEditing(true)}>
            {me.iban || pending ? t("profile.iban.change") : t("profile.iban.add")}
          </Button>
        )
      }
    >
      <Facts
        columns={1}
        items={[
          { label: t("profile.iban.current"), value: me.iban && <MaskedValue value={me.iban} /> },
          pending
            ? {
                label: t("profile.iban.pending"),
                value: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <bdi dir="ltr" className="tabular-nums">
                      {me.pendingIban}
                    </bdi>
                    <Badge tone="warning">{t("review.status.pending_review")}</Badge>
                  </span>
                ),
              }
            : null,
        ]}
      />
      {me.ibanReviewStatus === "rejected" && (
        <Alert tone="danger" role="status" className="mt-4">
          {t("profile.iban.rejected", { reason: me.ibanReviewReason ?? "" })}
        </Alert>
      )}
      {editing && (
        <form
          noValidate
          className="mt-5 space-y-3 border-t border-line pt-5"
          onSubmit={(ev) => {
            ev.preventDefault();
            const ok = isValidSaudiIban(value);
            setInvalid(!ok);
            if (ok) submit.mutate();
          }}
        >
          <Field label={t("profile.iban.new")} htmlFor="iban" hint={t("profile.iban.hint")} error={invalid ? t("employees.form.ibanInvalid") : undefined}>
            <Input id="iban" dir="ltr" autoFocus placeholder="SA00 0000 0000 0000 0000 0000" value={value} onChange={(ev) => setValue(ev.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={submit.isPending} disabled={value.trim() === ""}>
              {t("profile.iban.submit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setValue("");
                setInvalid(false);
                onEditing(false);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
