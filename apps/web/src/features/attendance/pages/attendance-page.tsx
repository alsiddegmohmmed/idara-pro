import { PERMISSIONS } from "@idara-pro/shared";
import { Download, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { REF_PERMISSION, useRefs } from "@/features/employees/api";
import { downloadFile } from "@/features/employees/documents";
import { nameIn } from "@/features/employees/employee-name";
import { formatDuration, formatTime, todayInRiyadh } from "@/lib/dates";
import { reportExcelPath, useBoard, useReport, type BoardRow, type BoardState } from "../api";
import { CorrectionDialog, type CorrectionTarget } from "../correction-dialog";
import { AttendanceBadge } from "../status-badge";
import { DatePicker, MonthPicker } from "@/components/ui/date-picker";

const SUMMARY_ORDER: BoardState[] = ["present", "late", "absent", "not_yet", "leave"];

function BranchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = useAuth();
  const branches = useRefs("branches");
  if (!can(REF_PERMISSION.branches)) return null;
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("employees.fields.branch")} className="w-auto min-w-40">
      <option value="">{t("employees.filters.allBranches")}</option>
      {branches.data?.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function EmployeeCell({ employee }: { employee: BoardRow["employee"] }): React.JSX.Element {
  const { i18n } = useTranslation();
  return (
    <Link to={`/employees/${employee.id}`} className="flex items-center gap-3 hover:text-primary">
      <Avatar name={employee.fullNameAr} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{nameIn(i18n, employee)}</span>
        <span className="block text-meta text-ink-muted">
          <bdi>{employee.employeeNo}</bdi>
        </span>
      </span>
    </Link>
  );
}

function BoardTab({ date, setDate, branchId, setBranchId }: { date: string; setDate: (v: string) => void; branchId: string; setBranchId: (v: string) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const board = useBoard(date, branchId);
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null);
  const canCorrect = can(PERMISSIONS.ATTENDANCE_CORRECT);
  const counts = useMemo(() => {
    const c = new Map<BoardState, number>();
    for (const r of board.data?.rows ?? []) c.set(r.state, (c.get(r.state) ?? 0) + 1);
    return c;
  }, [board.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DatePicker value={date} max={todayInRiyadh()} onChange={(v) => v && setDate(v)} aria-label={t("attendance.date")} className="w-auto" />
        <BranchFilter value={branchId} onChange={setBranchId} />
        {board.data && (
          <ul className="ms-auto flex flex-wrap gap-4" aria-label={t("attendance.summary")}>
            {SUMMARY_ORDER.filter((s) => counts.get(s)).map((s) => (
              <li key={s} className="text-meta text-ink-muted">
                {t(`attendance.status.${s}`)} <span className="font-semibold tabular-nums text-ink">{counts.get(s)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {board.isLoading && <TableSkeleton />}
      {board.data && board.data.rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("attendance.noEmployees")} />
        </div>
      )}
      {board.data && board.data.rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
              <TableHead>{t("attendance.in")}</TableHead>
              <TableHead>{t("attendance.out")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("attendance.lateMin")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("attendance.worked")}</TableHead>
              {canCorrect && (
                <TableHead className="w-24">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              )}
            </tr>
          </TableHeader>
          <TableBody>
            {board.data.rows.map((r) => (
              <TableRow key={r.employee.id}>
                <TableCell>
                  <EmployeeCell employee={r.employee} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AttendanceBadge state={r.state} />
                    {r.day?.missingCheckout && <span className="text-meta text-danger">{t("attendance.missingCheckout")}</span>}
                    {r.day?.corrected && <span className="text-meta text-ink-muted">{t("attendance.corrected")}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <bdi>{formatTime(r.day?.firstInAt ?? null)}</bdi>
                </TableCell>
                <TableCell>
                  <bdi>{formatTime(r.day?.lastOutAt ?? null)}</bdi>
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.day?.lateMin ?? 0}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <bdi>{formatDuration(r.day?.workedMin ?? 0)}</bdi>
                </TableCell>
                {canCorrect && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil />}
                      onClick={() => setCorrecting({ employee: r.employee, workDate: board.data.workDate, day: r.day })}
                    >
                      {t("attendance.correction.action")}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CorrectionDialog target={correcting} onClose={() => setCorrecting(null)} />
    </div>
  );
}

function ReportTab({ month, setMonth, branchId, setBranchId }: { month: string; setMonth: (v: string) => void; branchId: string; setBranchId: (v: string) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const report = useReport(month, branchId);
  const [downloading, setDownloading] = useState(false);

  async function exportExcel(): Promise<void> {
    setDownloading(true);
    try {
      await downloadFile(reportExcelPath(month, branchId), `attendance-${month}.xlsx`);
      toast.success(t("attendance.report.exported"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={month} max={todayInRiyadh().slice(0, 7)} onChange={setMonth} />
        <BranchFilter value={branchId} onChange={setBranchId} />
        <Button variant="secondary" icon={<Download />} loading={downloading} onClick={() => void exportExcel()} className="ms-auto">
          {t("attendance.report.export")}
        </Button>
      </div>
      {report.isLoading && <TableSkeleton />}
      {report.data && report.data.rows.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("attendance.report.empty")} />
        </div>
      )}
      {report.data && report.data.rows.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employee")}</TableHead>
              <TableHead>{t("attendance.report.workingDays")}</TableHead>
              <TableHead>{t("attendance.status.present")}</TableHead>
              <TableHead>{t("attendance.status.late")}</TableHead>
              <TableHead>{t("attendance.status.absent")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("attendance.status.leave")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("attendance.report.lateMinTotal")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("attendance.worked")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("attendance.missingCheckout")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {report.data.rows.map((r) => (
              <TableRow key={r.employee.id}>
                <TableCell>
                  <EmployeeCell employee={r.employee} />
                </TableCell>
                <TableCell>{r.workingDays}</TableCell>
                <TableCell>{r.present}</TableCell>
                <TableCell className={r.late ? "text-warning" : undefined}>{r.late}</TableCell>
                <TableCell className={r.absent ? "font-medium text-danger" : undefined}>{r.absent}</TableCell>
                <TableCell className="hidden md:table-cell">{r.leave}</TableCell>
                <TableCell className="hidden lg:table-cell">{r.lateMin}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <bdi>{formatDuration(r.workedMin)}</bdi>
                </TableCell>
                <TableCell className="hidden lg:table-cell">{r.missingCheckouts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** HR/manager attendance: who is in today (with corrections) and the monthly report + Excel export. */
export function AttendancePage(): React.JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "report" ? "report" : "board";
  const date = params.get("date") ?? todayInRiyadh();
  const month = params.get("month") ?? todayInRiyadh().slice(0, 7);
  const branchId = params.get("branch") ?? "";

  function set(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div>
      <PageHeader title={t("attendance.title")} description={t("attendance.description")} />
      <Tabs preload value={tab} onValueChange={(v) => set("tab", v === "board" ? "" : v)}>
        <TabsList>
          <TabsTrigger value="board">{t("attendance.tabs.board")}</TabsTrigger>
          <TabsTrigger value="report">{t("attendance.tabs.report")}</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <BoardTab date={date} setDate={(v) => set("date", v)} branchId={branchId} setBranchId={(v) => set("branch", v)} />
        </TabsContent>
        <TabsContent value="report">
          <ReportTab month={month} setMonth={(v) => set("month", v)} branchId={branchId} setBranchId={(v) => set("branch", v)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
