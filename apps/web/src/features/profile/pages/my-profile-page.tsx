import { zodResolver } from "@hookform/resolvers/zod";
import { MyProfileUpdateSchema, isValidSaudiIban } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { Field, Input, Textarea } from "@/components/ui/field";
import { DocumentStatus, DocumentUploadForm, downloadFile } from "@/features/employees/pages/employee-detail-page";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatHalalas } from "@/lib/money";
import type { Employee, EmployeeDocument, SalaryComponent } from "@/lib/types";

const contactSchema = z.object({
  phone: z.string(),
  personalEmail: z.string().refine((v) => v === "" || z.string().email().safeParse(v).success, "email"),
  address: z.string(),
  emergencyContactName: z.string(),
  emergencyContactPhone: z.string(),
});
type ContactValues = z.infer<typeof contactSchema>;
const nullIfEmpty = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function ContactCard({ me }: { me: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema) });
  useEffect(() => {
    reset({
      phone: me.phone ?? "", personalEmail: me.personalEmail ?? "", address: me.address ?? "",
      emergencyContactName: me.emergencyContactName ?? "", emergencyContactPhone: me.emergencyContactPhone ?? "",
    });
  }, [me, reset]);
  const save = useMutation({
    mutationFn: (v: ContactValues) =>
      apiJson<Employee>("/api/v1/me/profile", {
        method: "PATCH",
        // Validated with the same schema the API uses.
        ...jsonBody(MyProfileUpdateSchema.parse({
          phone: nullIfEmpty(v.phone), personalEmail: nullIfEmpty(v.personalEmail), address: nullIfEmpty(v.address),
          emergencyContactName: nullIfEmpty(v.emergencyContactName), emergencyContactPhone: nullIfEmpty(v.emergencyContactPhone),
        })),
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <Panel>
      <PanelTitle className="mb-4">{t("profile.contact.title")}</PanelTitle>
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={handleSubmit((v) => {
          setSaved(false);
          save.mutate(v);
        })}
      >
        <Field label={t("employees.fields.phone")} htmlFor="phone">
          <Input id="phone" dir="ltr" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label={t("employees.fields.personalEmail")} htmlFor="personalEmail" error={errors.personalEmail ? t("auth.login.invalidEmail") : undefined}>
          <Input id="personalEmail" type="email" dir="ltr" {...register("personalEmail")} />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("employees.fields.address")} htmlFor="address">
            <Textarea id="address" {...register("address")} />
          </Field>
        </div>
        <Field label={t("profile.contact.emergencyName")} htmlFor="emergencyContactName">
          <Input id="emergencyContactName" {...register("emergencyContactName")} />
        </Field>
        <Field label={t("profile.contact.emergencyPhone")} htmlFor="emergencyContactPhone">
          <Input id="emergencyContactPhone" dir="ltr" inputMode="tel" {...register("emergencyContactPhone")} />
        </Field>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={save.isPending}>{t("common.save")}</Button>
          {saved && <p role="status" className="text-dense text-primary">{t("profile.contact.saved")}</p>}
          {save.isError && <p role="alert" className="text-dense text-danger">{t("employees.form.saveFailed")}</p>}
        </div>
      </form>
    </Panel>
  );
}

function IbanCard({ me }: { me: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = useMutation({
    mutationFn: () => apiJson<Employee>("/api/v1/me/iban", { method: "POST", ...jsonBody({ iban: value }) }),
    onSuccess: async () => {
      setValue("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => setInvalid(e instanceof ApiError && e.status === 400),
  });
  return (
    <Panel>
      <PanelTitle className="mb-4">{t("profile.iban.title")}</PanelTitle>
      <dl className="space-y-1.5 text-dense">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">{t("profile.iban.current")}</dt>
          <dd><bdi dir="ltr" className="font-mono">{me.iban ?? "—"}</bdi></dd>
        </div>
        {me.ibanReviewStatus === "pending_review" && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-muted">{t("profile.iban.pending")}</dt>
            <dd className="flex items-center gap-2">
              <bdi dir="ltr" className="font-mono">{me.pendingIban}</bdi>
              <Badge tone="warning">{t("review.status.pending_review")}</Badge>
            </dd>
          </div>
        )}
      </dl>
      {me.ibanReviewStatus === "rejected" && (
        <p role="status" className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-meta text-danger">
          {t("profile.iban.rejected", { reason: me.ibanReviewReason ?? "" })}
        </p>
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = isValidSaudiIban(value);
          setInvalid(!ok);
          if (ok) submit.mutate();
        }}
      >
        <div className="min-w-64 flex-1">
          <Field
            label={t("profile.iban.new")}
            htmlFor="iban"
            hint={t("profile.iban.hint")}
            error={invalid ? t("employees.form.ibanInvalid") : undefined}
          >
            <Input id="iban" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={submit.isPending || value.trim() === ""}>{t("profile.iban.submit")}</Button>
      </form>
    </Panel>
  );
}

function DocumentsCard(): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["me", "documents"], queryFn: () => apiJson<EmployeeDocument[]>("/api/v1/me/documents") });
  return (
    <Panel>
      <PanelTitle className="mb-4">{t("documents.title")}</PanelTitle>
      <p className="mb-2 text-dense text-ink-muted">{t("profile.documents.note")}</p>
      {list.data?.length === 0 && <p className="text-dense text-ink-muted">{t("documents.empty")}</p>}
      <ul className="divide-y divide-line">
        {list.data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-dense">
            <span>
              <span className="font-medium">{t(`documents.types.${d.type}`)}</span> · <bdi dir="ltr">{d.number}</bdi>
            </span>
            <span className="flex items-center gap-3">
              <DocumentStatus doc={d} />
              <button type="button" className="text-meta text-primary underline" onClick={() => void downloadFile(`/api/v1/me/documents/${d.id}/file`, d.originalFilename)}>
                {t("documents.download")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <DocumentUploadForm path="/api/v1/me/documents" onDone={() => void queryClient.invalidateQueries({ queryKey: ["me", "documents"] })} />
    </Panel>
  );
}

export function MyProfilePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiJson<Employee>("/api/v1/me/profile") });
  const salary = useQuery({ queryKey: ["me", "salary"], queryFn: () => apiJson<SalaryComponent[]>("/api/v1/me/salary-components") });

  if (me.isLoading) return <p className="text-ink-muted">{t("common.loading")}</p>;
  if (me.isError || !me.data) {
    return (
      <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-meta text-danger">
        {me.error instanceof ApiError && me.error.status === 404 ? t("profile.noEmployee") : t("common.loadFailed")}
      </p>
    );
  }
  const e = me.data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-page-title">{i18n.language === "ar" ? e.fullNameAr : e.fullNameEn}</h1>
        <p className="text-dense text-ink-muted">{t("profile.subtitle")}</p>
      </div>

      <Panel>
        <PanelTitle className="mb-4">{t("profile.hrFields.title")}</PanelTitle>
        <p className="mb-2 text-dense text-ink-muted">{t("profile.hrFields.note")}</p>
        <dl className="grid gap-x-8 text-dense md:grid-cols-2">
          {[
            [t("employees.fields.employeeNo"), e.employeeNo],
            [t("employees.fields.nationalId"), e.nationalId],
            [t("employees.fields.jobTitle"), e.jobTitle ?? "—"],
            [t("employees.fields.hireDate"), e.hireDate.slice(0, 10)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-1.5">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="font-medium"><bdi dir="ltr">{value}</bdi></dd>
            </div>
          ))}
        </dl>
        {salary.data && salary.data.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line text-dense">
            {salary.data.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 py-1.5">
                <span>{t(`employees.salary.types.${c.type}`)}</span>
                <bdi dir="ltr" className="font-medium">{formatHalalas(c.amountHalalas)} {t("employees.salary.sar")}</bdi>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ContactCard me={e} />
      <IbanCard me={e} />
      <DocumentsCard />
    </div>
  );
}
