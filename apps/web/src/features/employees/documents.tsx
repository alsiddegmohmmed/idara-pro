import { useMutation } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiFetch, apiJson } from "@/lib/api";
import type { EmployeeDocument } from "@/lib/types";
import { DatePicker } from "@/components/ui/date-picker";

const DOCUMENT_TYPES = ["iqama", "passport", "national_id", "contract", "other"] as const;

export function DocumentStatus({ doc }: { doc: Pick<EmployeeDocument, "reviewStatus" | "reviewReason"> }): React.JSX.Element {
  const { t } = useTranslation();
  const tone = doc.reviewStatus === "pending_review" ? "warning" : doc.reviewStatus === "approved" ? "success" : "danger";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone={tone}>{t(`review.status.${doc.reviewStatus}`)}</Badge>
      {doc.reviewStatus === "rejected" && doc.reviewReason && (
        <span className="text-meta text-danger">{t("review.reasonLabel", { reason: doc.reviewReason })}</span>
      )}
    </span>
  );
}

/** Fetches a protected file (Authorization header) as a blob. */
export async function fetchFileBlob(path: string): Promise<Blob | null> {
  const response = await apiFetch(path);
  return response.ok ? response.blob() : null;
}

/** Saves a protected file; false when the server refused or the network failed. */
export async function downloadFile(path: string, filename: string): Promise<boolean> {
  const blob = await fetchFileBlob(path).catch(() => null);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Documents as a table: type + number, expiry, status, file actions. */
export function DocumentsTable({
  documents,
  filePath,
  onPreview,
}: {
  documents: EmployeeDocument[];
  filePath: (doc: EmployeeDocument) => string;
  onPreview?: (doc: EmployeeDocument) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead>{t("documents.document")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("documents.expiryDate")}</TableHead>
          <TableHead>{t("employees.fields.status")}</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">{t("common.actions")}</span>
          </TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {documents.map((d) => (
          <TableRow key={d.id}>
            <TableCell>
              <p className="font-medium">{t(`documents.types.${d.type}`)}</p>
              <p className="text-meta text-ink-muted">
                <bdi>{d.number}</bdi>
              </p>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <bdi>{d.expiryDate?.slice(0, 10) ?? "—"}</bdi>
            </TableCell>
            <TableCell>
              <DocumentStatus doc={d} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {onPreview && (
                  <Button variant="ghost" size="icon-sm" onClick={() => onPreview(d)} aria-label={t("documents.preview")}>
                    <Eye />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void downloadFile(filePath(d), d.originalFilename)}
                  aria-label={t("documents.downloadNamed", { name: d.originalFilename })}
                >
                  <Download />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DocumentUploadForm({ path, onDone }: { path: string; onDone: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const upload = useMutation({
    mutationFn: (body: FormData) => apiJson(path, { method: "POST", body }),
    onSuccess: () => {
      toast.success(t("documents.uploaded"));
      onDone();
    },
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
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formElement = e.currentTarget;
        const data = new FormData(formElement);
        for (const key of ["issueDate", "expiryDate"]) if (data.get(key) === "") data.delete(key);
        upload.mutate(data, {
          onSuccess: () => {
            formElement.reset();
            setIssueDate("");
            setExpiryDate("");
          },
        });
      }}
    >
      <Field label={t("documents.type")} htmlFor="d-type">
        <NativeSelect id="d-type" name="type" defaultValue="iqama">
          {DOCUMENT_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(`documents.types.${d}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("documents.number")} htmlFor="d-number">
        <Input id="d-number" name="number" dir="ltr" required />
      </Field>
      <Field label={t("documents.issueDate")} htmlFor="d-issue">
        <DatePicker id="d-issue" name="issueDate" value={issueDate} onChange={setIssueDate} max={expiryDate || undefined} clearable />
      </Field>
      <Field label={t("documents.expiryDate")} htmlFor="d-expiry">
        <DatePicker id="d-expiry" name="expiryDate" value={expiryDate} onChange={setExpiryDate} min={issueDate || undefined} clearable presets={[]} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("documents.file")} htmlFor="d-file" hint={t("documents.fileHint")}>
          <Input
            id="d-file"
            name="file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            required
            className="py-1.5 file:me-3 file:rounded-control file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-dense file:font-medium file:text-ink"
          />
        </Field>
      </div>
      {error && <Alert className="sm:col-span-2">{error}</Alert>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={upload.isPending} className="w-full sm:w-auto">
          {t("documents.upload")}
        </Button>
      </div>
    </form>
  );
}
