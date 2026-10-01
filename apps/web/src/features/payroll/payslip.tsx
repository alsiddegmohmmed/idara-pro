import type { PayrollItemView } from "@idara-pro/shared";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { nameIn } from "@/features/employees/employee-name";
import { formatHalalas } from "@/lib/money";

/** "أكتوبر 2026" / "October 2026" — Gregorian months in both languages. */
export function useMonthName(): (period: string) => string {
  const { i18n } = useTranslation();
  return (period) => {
    const [y = 0, m = 1] = period.split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  };
}

function Line({ label, halalas, hint, strong }: { label: string; halalas: string; hint?: string; strong?: boolean }): React.JSX.Element | null {
  if (!strong && BigInt(halalas) === 0n) return null;
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-line pt-2 font-semibold" : ""}`}>
      <span>
        {label}
        {hint && <span className="ms-1 text-meta text-ink-muted">({hint})</span>}
      </span>
      <bdi dir="ltr" className="tabular-nums">
        {formatHalalas(halalas)}
      </bdi>
    </div>
  );
}

const add = (...xs: string[]): string => xs.reduce((a, x) => a + BigInt(x), 0n).toString();

/** قسيمة الراتب — earnings, deductions and net, each explained; printable (only this block prints). */
export function Payslip({ item }: { item: PayrollItemView }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const monthName = useMonthName();
  const b = item.breakdown;
  const adjustments = b.adjustments ?? [];
  const totalDeductions = add(item.absenceHalalas, item.latenessHalalas, item.unpaidLeaveHalalas, item.tieredLeaveHalalas, item.deductionsHalalas, item.gosiEmployeeHalalas);
  const totalEarnings = add(item.grossHalalas, item.additionsHalalas);
  return (
    <div className="print-area space-y-5 rounded-panel border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-meta font-medium text-ink-muted">{t("app.name")}</p>
          <h2 className="text-section">{t("payroll.payslip.title", { month: monthName(item.period) })}</h2>
        </div>
        <div className="no-print flex items-center gap-2">
          {item.status === "calculated" && <Badge tone="warning">{t("payroll.status.calculated")}</Badge>}
          <Button size="sm" variant="secondary" icon={<Printer />} onClick={() => window.print()}>
            {t("payroll.payslip.print")}
          </Button>
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-1 text-dense sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-ink-muted">{t("payroll.payslip.employee")}:</dt>
          <dd className="font-medium">{item.employee ? nameIn(i18n, item.employee) : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-muted">{t("payroll.payslip.employeeNo")}:</dt>
          <dd>
            <bdi>{item.employee?.employeeNo ?? "—"}</bdi>
          </dd>
        </div>
        {item.employee?.jobTitle && (
          <div className="flex gap-2">
            <dt className="text-ink-muted">{t("payroll.payslip.jobTitle")}:</dt>
            <dd>{item.employee.jobTitle}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-ink-muted">{t("payroll.payslip.paidDays")}:</dt>
          <dd className="tabular-nums">{item.paidDays} / 30</dd>
        </div>
        {item.ibanMasked && (
          <div className="flex gap-2">
            <dt className="text-ink-muted">{t("payroll.payslip.iban")}:</dt>
            <dd>
              <bdi dir="ltr">{item.ibanMasked}</bdi>
            </dd>
          </div>
        )}
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-muted">{t("payroll.payslip.earnings")}</h3>
          <div className="text-body">
            <Line label={t("payroll.lines.basic")} halalas={item.basicHalalas} />
            <Line label={t("payroll.lines.housing")} halalas={item.housingHalalas} />
            <Line label={t("payroll.lines.transport")} halalas={item.transportHalalas} />
            <Line label={t("payroll.lines.other")} halalas={item.otherHalalas} />
            {adjustments
              .filter((a) => a.kind !== "deduction")
              .map((a) => (
                <Line key={a.id} label={t(`adjustments.kinds.${a.kind}`)} hint={a.reason} halalas={a.amountHalalas} />
              ))}
            <Line strong label={t("payroll.payslip.totalEarnings")} halalas={totalEarnings} />
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-muted">{t("payroll.payslip.deductions")}</h3>
          <div className="text-body">
            <Line label={t("payroll.lines.absence")} hint={t("payroll.units.days", { count: b.absentDays })} halalas={item.absenceHalalas} />
            <Line label={t("payroll.lines.lateness")} hint={t("payroll.units.minutes", { count: b.lateMinutes })} halalas={item.latenessHalalas} />
            <Line label={t("payroll.lines.unpaidLeave")} hint={t("payroll.units.days", { count: b.unpaidLeaveDays })} halalas={item.unpaidLeaveHalalas} />
            <Line label={t("payroll.lines.tieredLeave")} hint={t("payroll.units.days", { count: b.tieredLeaveDays })} halalas={item.tieredLeaveHalalas} />
            {adjustments
              .filter((a) => a.kind === "deduction")
              .map((a) => (
                <Line key={a.id} label={t("adjustments.kinds.deduction")} hint={a.reason} halalas={a.amountHalalas} />
              ))}
            <Line label={t("payroll.lines.gosiEmployee")} halalas={item.gosiEmployeeHalalas} />
            <Line strong label={t("payroll.payslip.totalDeductions")} halalas={totalDeductions} />
          </div>
        </section>
      </div>

      <div className="flex items-baseline justify-between rounded-control bg-primary-soft px-4 py-3">
        <span className="text-section">{t("payroll.payslip.net")}</span>
        <span className="text-page-title tabular-nums">
          <bdi dir="ltr">{formatHalalas(item.netHalalas)}</bdi> <span className="text-body font-normal">{t("employees.salary.sar")}</span>
        </span>
      </div>
      {BigInt(item.gosiEmployerHalalas) > 0n && (
        <p className="text-meta text-ink-muted">
          {t("payroll.payslip.employerShare", { amount: formatHalalas(item.gosiEmployerHalalas) })}
        </p>
      )}
    </div>
  );
}
