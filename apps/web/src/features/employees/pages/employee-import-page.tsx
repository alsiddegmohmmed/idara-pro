import { IMPORT_COLUMNS, type ImportReport, type ImportRowResult } from "@idara-pro/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { usePageCrumb } from "@/app/shell/crumb";
import { ApiError, apiJson } from "@/lib/api";
import { employeesKey } from "../api";
import { downloadFile } from "../documents";

const TEMPLATE_PATH = "/api/v1/employees/import/template.xlsx";

/**
 * Excel import of employees (roadmap Phase 5): download the template (this company's branches, departments
 * and schedules in its dropdowns), fill it in, upload it for a check, fix what the check finds, import.
 * The real import is all or nothing: it saves only when every row is ready.
 */
export function EmployeeImportPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  usePageCrumb(t("employees.import.title"));
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const columnLabel = (key: string): string => {
    if (key === "row") return t("employees.import.wholeRow");
    const c = IMPORT_COLUMNS.find((x) => x.key === key);
    return c ? (i18n.language === "ar" ? c.ar : c.en) : key;
  };
  const fileErrorText = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === "employees.import.missing_columns") {
        const cols = Array.isArray(e.details.columns) ? (e.details.columns as string[]).map(columnLabel).join("، ") : "";
        return t("employees.import.fileErrors.missing_columns", { columns: cols });
      }
      const key = e.code.replace("employees.import.", "");
      if (i18n.exists(`employees.import.fileErrors.${key}`)) return t(`employees.import.fileErrors.${key}`, { max: e.details.max });
    }
    return t("employees.import.fileErrors.failed");
  };

  const send = useMutation({
    mutationFn: ({ f, dryRun }: { f: File; dryRun: boolean }) => {
      const body = new FormData();
      body.append("file", f);
      return apiJson<ImportReport>(`/api/v1/employees/import?dryRun=${dryRun}`, { method: "POST", body });
    },
    onSuccess: (r) => {
      setReport(r);
      if (!r.dryRun && r.created > 0) {
        toast.success(t("employees.import.created", { count: r.created }));
        void queryClient.invalidateQueries({ queryKey: employeesKey });
      }
    },
    onError: (e) => {
      setReport(null);
      setFileError(fileErrorText(e));
    },
  });

  const check = (f: File): void => {
    setFile(f);
    setReport(null);
    setFileError(null);
    send.mutate({ f, dryRun: true });
  };
  const done = report && !report.dryRun && report.created > 0;
  const problems = report?.rows.filter((r) => r.status === "error") ?? [];

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <PageHeader title={t("employees.import.title")} description={t("employees.import.description")} />

      <Panel>
        <PanelHeader title={t("employees.import.step1")} />
        <p className="mb-4 text-body text-ink-muted">{t("employees.import.step1Body")}</p>
        <Button
          variant="secondary"
          icon={<Download />}
          onClick={async () => {
            if (!(await downloadFile(TEMPLATE_PATH, "employees-import-template.xlsx"))) toast.error(t("employees.import.fileErrors.failed"));
          }}
        >
          {t("employees.import.download")}
        </Button>
        <details className="mt-4">
          <summary className="cursor-pointer text-dense font-medium text-primary">{t("employees.import.columns")}</summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-dense sm:grid-cols-2">
            {IMPORT_COLUMNS.map((c) => (
              <li key={c.key} className="flex items-baseline gap-2">
                <span className="text-ink">{i18n.language === "ar" ? c.ar : c.en}</span>
                {c.required && <span className="text-meta text-danger">{t("employees.import.required")}</span>}
              </li>
            ))}
          </ul>
        </details>
      </Panel>

      <Panel>
        <PanelHeader title={t("employees.import.step2")} />
        <p className="mb-4 text-body text-ink-muted">{t("employees.import.step2Body")}</p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) check(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Upload />} loading={send.isPending && send.variables?.dryRun} onClick={() => input.current?.click()}>
            {file ? t("employees.import.uploadAgain") : t("employees.import.upload")}
          </Button>
          {file && (
            <span className="inline-flex items-center gap-1.5 text-dense text-ink-muted">
              <FileSpreadsheet className="size-4" aria-hidden />
              <bdi>{file.name}</bdi>
            </span>
          )}
        </div>
        {fileError && <Alert className="mt-4">{fileError}</Alert>}
      </Panel>

      {report && !done && (
        <Panel>
          <PanelHeader title={t("employees.import.step3")} />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t("employees.import.total", { count: report.total })}</Badge>
            <Badge tone="success">{t("employees.import.ready", { count: report.ready })}</Badge>
            {report.withErrors > 0 && <Badge tone="danger">{t("employees.import.withErrors", { count: report.withErrors })}</Badge>}
          </div>
          {problems.length > 0 ? (
            <>
              <Alert tone="warning" className="mb-4">
                {t("employees.import.fixAndRetry")}
              </Alert>
              <ProblemTable rows={problems} columnLabel={columnLabel} />
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <p className="flex flex-1 items-center gap-2 text-body text-ink">
                <CheckCircle2 className="size-5 text-success" aria-hidden />
                {t("employees.import.allReady", { count: report.ready })}
              </p>
              <Button loading={send.isPending && send.variables?.dryRun === false} onClick={() => file && send.mutate({ f: file, dryRun: false })}>
                {t("employees.import.import", { count: report.ready })}
              </Button>
            </div>
          )}
        </Panel>
      )}

      {done && (
        <Panel>
          <p className="flex items-center gap-2 text-section text-ink">
            <CheckCircle2 className="size-6 text-success" aria-hidden />
            {t("employees.import.created", { count: report.created })}
          </p>
          <p className="mt-2 text-body text-ink-muted">{t("employees.import.next")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/employees?status=active&account=none">{t("employees.import.inviteThem")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/employees">{t("employees.import.viewEmployees")}</Link>
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ProblemTable({ rows, columnLabel }: { rows: ImportRowResult[]; columnLabel: (key: string) => string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead className="w-20">{t("employees.import.row")}</TableHead>
          <TableHead>{t("employees.fields.employee")}</TableHead>
          <TableHead>{t("employees.import.problems")}</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.row}>
            <TableCell className="align-top tabular-nums">{r.row}</TableCell>
            <TableCell className="align-top font-medium">{r.name ?? "—"}</TableCell>
            <TableCell>
              <ul className="space-y-1 text-dense">
                {r.errors.map((e) => (
                  <li key={`${e.column}-${e.code}`}>
                    <span className="font-medium">{columnLabel(e.column)}:</span>{" "}
                    {t(e.column === "managerNo" && e.code === "unknown" ? "employees.import.errors.managerUnknown" : `employees.import.errors.${e.code}`)}
                  </li>
                ))}
              </ul>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
