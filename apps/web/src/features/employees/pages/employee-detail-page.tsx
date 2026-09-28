import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useAuth } from "@/features/auth";
import { ApiError, apiFetch, apiJson, jsonBody } from "@/lib/api";
import { formatHalalas, sarToHalalas } from "@/lib/money";
import type { EmployeeDocument, SalaryComponent } from "@/lib/types";
import { useEmployee } from "../api";

const DOCUMENT_TYPES = ["iqama", "passport", "national_id", "contract", "other"] as const;
const COMPONENT_TYPES = ["basic", "housing", "transport", "other"] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{children ?? "—"}</dd>
    </div>
  );
}

function InviteCard({ employeeId, linked }: { employeeId: string; linked: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const invite = useMutation({
    mutationFn: () => apiJson(`/api/v1/employees/${employeeId}/invite`, { method: "POST", ...jsonBody({ email }) }),
    onSuccess: () => setMessage({ ok: true, text: t("employees.invite.sent", { email }) }),
    onError: (error: Error) => {
      const code = error instanceof ApiError ? error.code : "";
      setMessage({
        ok: false,
        text:
          code === "auth.invitation.email_in_use" ? t("employees.invite.emailInUse")
          : code === "employees.already_linked" ? t("employees.invite.alreadyLinked")
          : code === "employees.inactive" ? t("employees.invite.inactive")
          : t("employees.invite.failed"),
      });
    },
  });

  if (!can(PERMISSIONS.EMPLOYEES_INVITE)) return <></>;
  return (
    <Card>
      <CardTitle>{t("employees.invite.title")}</CardTitle>
      {linked ? (
        <p className="text-sm text-muted-foreground">{t("employees.invite.linked")}</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            invite.mutate();
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label={t("employees.invite.email")} htmlFor="invite-email" hint={t("employees.invite.hint")}>
              <Input id="invite-email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={invite.isPending}>{t("employees.invite.send")}</Button>
        </form>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-primary" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </Card>
  );
}

function SalaryCard({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const key = ["salary", employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => apiJson<SalaryComponent[]>(`/api/v1/employees/${employeeId}/salary-components`) });
  const [form, setForm] = useState({ type: "basic", amount: "", from: "", to: "" });
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (amountHalalas: string) =>
      apiJson(`/api/v1/employees/${employeeId}/salary-components`, {
        method: "POST",
        ...jsonBody({ type: form.type, amountHalalas, effectiveFrom: form.from, ...(form.to ? { effectiveTo: form.to } : {}) }),
      }),
    onSuccess: () => {
      setForm({ type: "basic", amount: "", from: "", to: "" });
      return queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError && e.code === "employees.salary_component.overlapping_range" ? t("employees.salary.overlap") : t("employees.salary.failed")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/salary-components/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <Card>
      <CardTitle>{t("employees.salary.title")}</CardTitle>
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("employees.salary.empty")}</p>}
      <ul className="divide-y divide-border">
        {list.data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              {t(`employees.salary.types.${c.type}`)} · <bdi dir="ltr">{c.effectiveFrom.slice(0, 10)} → {c.effectiveTo?.slice(0, 10) ?? t("employees.salary.open")}</bdi>
            </span>
            <span className="flex items-center gap-3">
              <bdi dir="ltr" className="font-medium">{formatHalalas(c.amountHalalas)} {t("employees.salary.sar")}</bdi>
              {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
                <button type="button" className="text-xs text-destructive underline" onClick={() => remove.mutate(c.id)}>
                  {t("common.delete")}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const halalas = sarToHalalas(form.amount);
            if (!halalas) return setError(t("employees.salary.badAmount"));
            add.mutate(halalas);
          }}
        >
          <Field label={t("employees.salary.type")} htmlFor="c-type">
            <Select id="c-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {COMPONENT_TYPES.map((c) => <option key={c} value={c}>{t(`employees.salary.types.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("employees.salary.amount")} htmlFor="c-amount">
            <Input id="c-amount" dir="ltr" inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label={t("employees.salary.from")} htmlFor="c-from">
            <Input id="c-from" type="date" dir="ltr" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label={t("employees.salary.to")} htmlFor="c-to">
            <Input id="c-to" type="date" dir="ltr" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Button type="submit" className="self-end" disabled={add.isPending}>{t("common.add")}</Button>
          {error && <p role="alert" className="text-sm text-destructive md:col-span-5">{error}</p>}
        </form>
      )}
    </Card>
  );
}

export function DocumentStatus({ doc }: { doc: Pick<EmployeeDocument, "reviewStatus" | "reviewReason"> }): React.JSX.Element {
  const { t } = useTranslation();
  const tone = doc.reviewStatus === "pending_review" ? "pending" : doc.reviewStatus === "approved" ? "approved" : "rejected";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={tone}>{t(`review.status.${doc.reviewStatus}`)}</Badge>
      {doc.reviewStatus === "rejected" && doc.reviewReason && (
        <span className="text-xs text-destructive">{t("review.reasonLabel", { reason: doc.reviewReason })}</span>
      )}
    </span>
  );
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path);
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentUploadForm({ path, onDone }: { path: string; onDone: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (body: FormData) => apiJson(path, { method: "POST", body }),
    onSuccess: onDone,
    onError: (e: Error) => {
      const code = e instanceof ApiError ? e.code : "";
      setError(
        code === "employees.document.invalid_file_type" ? t("documents.invalidType")
        : code === "employees.document.too_large" ? t("documents.tooLarge")
        : code === "employees.document.invalid_date_range" ? t("employees.form.dateRange")
        : t("documents.failed"),
      );
    },
  });
  return (
    <form
      className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formElement = e.currentTarget;
        const data = new FormData(formElement);
        for (const key of ["issueDate", "expiryDate"]) if (data.get(key) === "") data.delete(key);
        upload.mutate(data, { onSuccess: () => formElement.reset() });
      }}
    >
      <Field label={t("documents.type")} htmlFor="d-type">
        <Select id="d-type" name="type" defaultValue="iqama">
          {DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{t(`documents.types.${d}`)}</option>)}
        </Select>
      </Field>
      <Field label={t("documents.number")} htmlFor="d-number">
        <Input id="d-number" name="number" dir="ltr" required />
      </Field>
      <Field label={t("documents.issueDate")} htmlFor="d-issue">
        <Input id="d-issue" name="issueDate" type="date" dir="ltr" />
      </Field>
      <Field label={t("documents.expiryDate")} htmlFor="d-expiry">
        <Input id="d-expiry" name="expiryDate" type="date" dir="ltr" />
      </Field>
      <div className="md:col-span-3">
        <Field label={t("documents.file")} htmlFor="d-file" hint={t("documents.fileHint")}>
          <Input id="d-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
        </Field>
      </div>
      <Button type="submit" className="self-end" disabled={upload.isPending}>{t("documents.upload")}</Button>
      {error && <p role="alert" className="text-sm text-destructive md:col-span-4">{error}</p>}
    </form>
  );
}

function DocumentsCard({ employeeId }: { employeeId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const key = ["documents", employeeId];
  const list = useQuery({ queryKey: key, queryFn: () => apiJson<EmployeeDocument[]>(`/api/v1/employees/${employeeId}/documents`) });
  return (
    <Card>
      <CardTitle>{t("documents.title")}</CardTitle>
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>}
      <ul className="divide-y divide-border">
        {list.data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-medium">{t(`documents.types.${d.type}`)}</span> · <bdi dir="ltr">{d.number}</bdi>
              {d.expiryDate && <span className="text-muted-foreground"> · {t("documents.expires", { date: d.expiryDate.slice(0, 10) })}</span>}
            </span>
            <span className="flex items-center gap-3">
              <DocumentStatus doc={d} />
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => void downloadFile(`/api/v1/employees/${employeeId}/documents/${d.id}/file`, d.originalFilename)}
              >
                {t("documents.download")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {can(PERMISSIONS.EMPLOYEES_CREATE) && (
        <DocumentUploadForm
          path={`/api/v1/employees/${employeeId}/documents`}
          onDone={() => void queryClient.invalidateQueries({ queryKey: key })}
        />
      )}
    </Card>
  );
}

export function EmployeeDetailPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { can } = useAuth();
  const { data: e, isLoading, isError } = useEmployee(id);

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (isError || !e || !id) return <p role="alert" className="text-destructive">{t("common.loadFailed")}</p>;

  const name = i18n.language === "ar" ? e.fullNameAr : e.fullNameEn;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <Badge tone={e.status === "active" ? "approved" : "neutral"}>{t(`employees.status.${e.status}`)}</Badge>
        </div>
        {can(PERMISSIONS.EMPLOYEES_UPDATE) && (
          <Link to={`/employees/${e.id}/edit`}><Button variant="outline">{t("common.edit")}</Button></Link>
        )}
      </div>

      <Card>
        <dl className="grid gap-x-8 md:grid-cols-2">
          <Row label={t("employees.fields.employeeNo")}><bdi dir="ltr">{e.employeeNo}</bdi></Row>
          <Row label={t("employees.fields.nationalId")}><bdi dir="ltr">{e.nationalId}</bdi></Row>
          <Row label={t("employees.fields.nationality")}>{e.nationality}</Row>
          <Row label={t("employees.fields.jobTitle")}>{e.jobTitle}</Row>
          <Row label={t("employees.fields.hireDate")}><bdi dir="ltr">{e.hireDate.slice(0, 10)}</bdi></Row>
          <Row label={t("employees.fields.phone")}><bdi dir="ltr">{e.phone}</bdi></Row>
          <Row label={t("employees.fields.personalEmail")}><bdi dir="ltr">{e.personalEmail}</bdi></Row>
          <Row label={t("employees.fields.address")}>{e.address}</Row>
          <Row label={t("employees.fields.emergencyContact")}>
            {e.emergencyContactName ? <>{e.emergencyContactName} · <bdi dir="ltr">{e.emergencyContactPhone}</bdi></> : null}
          </Row>
          <Row label={t("employees.fields.iban")}><bdi dir="ltr">{e.iban}</bdi></Row>
        </dl>
        {e.ibanReviewStatus === "pending_review" && (
          <p className="mt-2 text-sm text-warning">
            <Link to="/review-queue" className="underline">{t("employees.ibanWaiting")}</Link>
          </p>
        )}
      </Card>

      <InviteCard employeeId={e.id} linked={Boolean(e.userId)} />
      <SalaryCard employeeId={e.id} />
      <DocumentsCard employeeId={e.id} />
    </div>
  );
}
