import { zodResolver } from "@hookform/resolvers/zod";
import { MyProfileUpdateSchema, PhoneSchema, isValidSaudiIban } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { ContactsPanel } from "@/features/employees/contacts-panel";
import { ContractsTab } from "@/features/employees/contracts-tab";
import { DocumentsTable, DocumentUploadForm } from "@/features/employees/documents";
import { InsuranceTab } from "@/features/employees/insurance-tab";
import { Fact, RecordHeader } from "@/features/employees/record-header";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatHalalas } from "@/lib/money";
import { MyWarningsPanel } from "@/features/discipline/warnings";
import type { Employee, EmployeeDocument, SalaryComponent } from "@/lib/types";

const phone = z.string().refine((v) => v.trim() === "" || PhoneSchema.safeParse(v).success, "phone");
const contactSchema = z.object({
  phone,
  additionalPhone: phone,
  personalEmail: z.string().refine((v) => v === "" || z.string().email().safeParse(v).success, "email"),
  address: z.string(),
});
type ContactValues = z.infer<typeof contactSchema>;
const nullIfEmpty = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function ContactCard({ me }: { me: Employee }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema) });
  useEffect(() => {
    reset({
      phone: me.phone ?? "", additionalPhone: me.additionalPhone ?? "", personalEmail: me.personalEmail ?? "", address: me.address ?? "",
    });
  }, [me, reset]);
  const save = useMutation({
    mutationFn: (v: ContactValues) =>
      apiJson<Employee>("/api/v1/me/profile", {
        method: "PATCH",
        // Validated with the same schema the API uses.
        ...jsonBody(MyProfileUpdateSchema.parse({
          phone: nullIfEmpty(v.phone), additionalPhone: nullIfEmpty(v.additionalPhone), personalEmail: nullIfEmpty(v.personalEmail),
          address: nullIfEmpty(v.address),
        })),
      }),
    onSuccess: async () => {
      toast.success(t("common.changesSaved"));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <Panel>
      <PanelHeader title={t("profile.contact.title")} />
      <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Field label={t("employees.fields.phone")} htmlFor="phone" error={errors.phone ? t("employees.form.phoneInvalid") : undefined}>
          <Input id="phone" type="tel" dir="ltr" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label={t("employees.fields.additionalPhone")} htmlFor="additionalPhone" error={errors.additionalPhone ? t("employees.form.phoneInvalid") : undefined}>
          <Input id="additionalPhone" type="tel" dir="ltr" inputMode="tel" {...register("additionalPhone")} />
        </Field>
        <Field label={t("employees.fields.personalEmail")} htmlFor="personalEmail" error={errors.personalEmail ? t("auth.login.invalidEmail") : undefined}>
          <Input id="personalEmail" type="email" dir="ltr" {...register("personalEmail")} />
        </Field>
        <div className="md:col-span-2">
          <Field label={t("employees.fields.address")} htmlFor="address">
            <Textarea id="address" {...register("address")} />
          </Field>
        </div>
        {save.isError && <Alert className="md:col-span-2">{t("employees.form.saveFailed")}</Alert>}
        <div className="md:col-span-2">
          <Button type="submit" loading={save.isPending} className="h-12 w-full sm:h-10 sm:w-auto">
            {t("common.saveChanges")}
          </Button>
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
      toast.success(t("profile.iban.submitted"));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.status === 400) setInvalid(true);
      else toast.error(t("review.failed"));
    },
  });
  return (
    <Panel>
      <PanelHeader
        title={t("profile.iban.title")}
        actions={
          me.ibanReviewStatus && (
            <Badge tone={me.ibanReviewStatus === "pending_review" ? "warning" : me.ibanReviewStatus === "approved" ? "success" : "danger"}>
              {t(`review.status.${me.ibanReviewStatus}`)}
            </Badge>
          )
        }
      />
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label={t("profile.iban.current")}>{me.iban && <bdi className="tabular-nums">{me.iban}</bdi>}</Fact>
        {me.ibanReviewStatus === "pending_review" && (
          <Fact label={t("profile.iban.pending")}>
            <bdi className="tabular-nums">{me.pendingIban}</bdi>
          </Fact>
        )}
      </dl>
      {me.ibanReviewStatus === "rejected" && (
        <Alert tone="danger" role="status" className="mt-4">
          {t("profile.iban.rejected", { reason: me.ibanReviewReason ?? "" })}
        </Alert>
      )}
      <form
        noValidate
        className="mt-6 flex flex-wrap items-start gap-3 border-t border-line pt-6"
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
        <Button type="submit" loading={submit.isPending} disabled={value.trim() === ""} className="h-12 w-full sm:mt-[26px] sm:h-10 sm:w-auto">
          {t("profile.iban.submit")}
        </Button>
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
      <PanelHeader title={t("profile.documents.title")} />
      <p className="mb-4 text-body text-ink-muted">{t("profile.documents.note")}</p>
      {list.isLoading && <Skeleton className="h-24" />}
      {list.data && list.data.length === 0 && <p className="mb-4 text-body text-ink-muted">{t("documents.empty")}</p>}
      {list.data && list.data.length > 0 && (
        <div className="mb-6">
          <DocumentsTable documents={list.data} filePath={(d) => `/api/v1/me/documents/${d.id}/file`} />
        </div>
      )}
      <div className="border-t border-line pt-6">
        <DocumentUploadForm path="/api/v1/me/documents" onDone={() => void queryClient.invalidateQueries({ queryKey: ["me", "documents"] })} />
      </div>
    </Panel>
  );
}

export function MyProfilePage(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMyEmployee();
  const salary = useQuery({ queryKey: ["me", "salary"], queryFn: () => apiJson<SalaryComponent[]>("/api/v1/me/salary-components") });

  if (me.isLoading) {
    return (
      <div className="space-y-6" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-56" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!me.employee) return <Alert tone="info">{t("profile.noEmployee")}</Alert>;
  const e = me.employee;
  return (
    <div className="space-y-6">
      <RecordHeader
        employee={e}
        facts={
          <>
            <Fact label={t("employees.fields.employeeNo")}>
              <bdi>{e.employeeNo}</bdi>
            </Fact>
            <Fact label={t("employees.fields.nationalId")}>
              <bdi className="tabular-nums">{e.nationalId}</bdi>
            </Fact>
            <Fact label={t("employees.fields.hireDate")}>
              <bdi className="tabular-nums">{e.hireDate.slice(0, 10)}</bdi>
            </Fact>
            {salary.data?.map((c) => (
              <Fact key={c.id} label={t(`employees.salary.types.${c.type}`)}>
                <bdi className="tabular-nums">{formatHalalas(c.amountHalalas)}</bdi> {t("employees.salary.sar")}
              </Fact>
            ))}
          </>
        }
      />
      <p className="text-meta text-ink-muted">{t("profile.hrFields.note")}</p>
      <ContactCard me={e} />
      <ContactsPanel basePath="/api/v1/me/contacts" canEdit />
      <Panel>
        <PanelHeader title={t("employees.sections.contracts")} />
        <ContractsTab basePath="/api/v1/me/contracts" readOnly />
      </Panel>
      <Panel>
        <PanelHeader title={t("employees.sections.insurance")} />
        <InsuranceTab basePath="/api/v1/me/insurance" readOnly />
      </Panel>
      <MyWarningsPanel />
      <IbanCard me={e} />
      <DocumentsCard />
    </div>
  );
}
