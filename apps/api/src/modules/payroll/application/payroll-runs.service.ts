import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma, type Employee, type PayrollItem, type PayrollRun } from "@prisma/client";
import {
  COMPANY_SETTING_KEYS,
  PERMISSIONS,
  type PayrollItemBreakdown,
  type PayrollItemView,
  type PayrollRunDetail,
  type PayrollRunView,
  type PayrollTotals,
  type PayrollWarning,
} from "@idara-pro/shared";
import { AttendanceTotalsService } from "../../attendance";
import { AuditService } from "../../audit";
import { CompanyCalendarLoader, CompanySettingsService } from "../../company";
import { EmployeeScopeService, EmployeesService, SalaryComponentsService } from "../../employees";
import { LeavePayrollService } from "../../leave";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import { hashRequest, IdempotencyService } from "../../../shared/idempotency/idempotency.service";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { calculatePay, employedDaysIn } from "../domain/payroll-calculation";
import { DEFAULT_MAX_DEDUCTION_PERCENT } from "./adjustments.service";
import { buildPayrollWorkbook } from "./payroll-export";
import { ADJUSTMENTS_REPOSITORY, type AdjustmentsRepositoryPort } from "./ports/adjustments-repository.port";
import { PAYROLL_RUNS_REPOSITORY, type NewPayrollItem, type PayrollRunsRepositoryPort } from "./ports/payroll-runs-repository.port";

/** Owner defaults 2026-10-01 — each one a company setting with a start date. GOSI: confirm before go-live. */
export const PAYROLL_DEFAULTS = {
  gosiSaudiEmployeePercent: 9.75,
  gosiSaudiEmployerPercent: 11.75,
  gosiNonSaudiEmployeePercent: 0,
  gosiNonSaudiEmployerPercent: 2,
  gosiBaseCapSar: 45_000,
  absenceIncludesHousing: 1,
  latenessDeduction: 1,
  /** Used when a schedule has no times. */
  dayMinutes: 480,
} as const;

interface PayrollSettings {
  gosiSaudiEmployeePercent: number;
  gosiSaudiEmployerPercent: number;
  gosiNonSaudiEmployeePercent: number;
  gosiNonSaudiEmployerPercent: number;
  gosiBaseCapSar: number;
  absenceIncludesHousing: boolean;
  latenessDeduction: boolean;
  maxDeductionPercent: number;
}

const s = (n: bigint): string => n.toString();
const monthBounds = (period: string): { from: Date; to: Date } => {
  const [y = 0, m = 1] = period.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
};
const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const inEmployment = (iso: string, e: Pick<Employee, "hireDate" | "endDate">): boolean => {
  const t = new Date(`${iso}T00:00:00.000Z`).getTime();
  return t >= e.hireDate.getTime() && (!e.endDate || t <= e.endDate.getTime());
};
/** Whole-company reach — for the run's own bookkeeping (approve, export IBANs), never to answer a reader. */
const ALL = { all: true } as const;
/** Everything that decides a line's money, per employee — two calculations match iff this matches. */
const FINGERPRINT_FIELDS = [
  "paidDays", "basicHalalas", "housingHalalas", "transportHalalas", "otherHalalas", "grossHalalas", "absenceHalalas", "latenessHalalas",
  "unpaidLeaveHalalas", "tieredLeaveHalalas", "additionsHalalas", "deductionsHalalas", "gosiEmployeeHalalas", "gosiEmployerHalalas", "netHalalas",
] as const;
function fingerprint(items: Array<Pick<PayrollItem, "employeeId" | "branchId" | "breakdown" | (typeof FINGERPRINT_FIELDS)[number]> | NewPayrollItem>): string {
  return items
    .map((i) => {
      const adjustments = ((i.breakdown as unknown as PayrollItemBreakdown).adjustments ?? []).map((a) => a.id).sort();
      return JSON.stringify([i.employeeId, i.branchId ?? null, ...FINGERPRINT_FIELDS.map((f) => String(i[f])), adjustments]);
    })
    .sort()
    .join("\n");
}
const maskIban = (iban: string | null): string | null => (iban ? `${"•".repeat(Math.max(0, iban.length - 4))}${iban.slice(-4)}` : null);

/**
 * Monthly payroll (business-rules.md "Payroll"): one run per company and month, calculated from salary components,
 * attendance, approved leave and approved adjustments (payroll:run, company reach); recalculated as often as
 * needed; approved by a *different* person (payroll:approve) — then locked: items, settings and the adjustments it
 * paid never change; corrections go into a later month. Readers see the lines of employees in their reach
 * (branch snapshot on each item). Employees see their own payslip once approved.
 */
@Injectable()
export class PayrollRunsService {
  private readonly logger = new Logger(PayrollRunsService.name);

  constructor(
    @Inject(PAYROLL_RUNS_REPOSITORY) private readonly repository: PayrollRunsRepositoryPort,
    @Inject(ADJUSTMENTS_REPOSITORY) private readonly adjustments: AdjustmentsRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly salaries: SalaryComponentsService,
    private readonly scope: EmployeeScopeService,
    private readonly settings: CompanySettingsService,
    private readonly calendars: CompanyCalendarLoader,
    private readonly attendance: AttendanceTotalsService,
    private readonly leave: LeavePayrollService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly idempotency: IdempotencyService,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- reading ----------

  async list(user: AuthenticatedUser): Promise<PayrollRunView[]> {
    const readScope = this.scope.scope(user, PERMISSIONS.PAYROLL_READ);
    if (!readScope) return [];
    const runs = await this.repository.listRuns(user.companyId);
    const items = await this.repository.listItems(user.companyId, runs.map((r) => r.id), readScope);
    return runs.map((r) => this.runView(user, r, items.filter((i) => i.runId === r.id)));
  }

  async get(user: AuthenticatedUser, id: string): Promise<PayrollRunDetail> {
    const readScope = this.scope.scope(user, PERMISSIONS.PAYROLL_READ);
    const run = await this.repository.findRun(user.companyId, id);
    if (!run || !readScope) throw new NotFoundError("Payroll run not found", "payroll.not_found");
    const items = await this.repository.listItems(user.companyId, [run.id], readScope);
    const employees = await this.employees.byIdsForRecords(user.companyId, items.map((i) => i.employeeId));
    const views = items
      .map((i) => this.itemView(i, run, employees.get(i.employeeId)))
      .sort((a, b) => (a.employee?.employeeNo ?? "").localeCompare(b.employee?.employeeNo ?? ""));
    return { ...this.runView(user, run, items), items: views };
  }

  /** The signed-in employee's payslips (approved runs only). */
  async myPayslips(user: AuthenticatedUser): Promise<PayrollItemView[]> {
    const me = await this.me(user);
    return (await this.repository.employeePayslips(user.companyId, me.id)).map((i) => this.itemView(i, i.run, me));
  }

  async myPayslip(user: AuthenticatedUser, itemId: string): Promise<PayrollItemView> {
    const me = await this.me(user);
    const item = await this.repository.findItem(user.companyId, itemId);
    if (!item || item.employeeId !== me.id || item.run.status === "calculated") throw new NotFoundError("Payslip not found", "payroll.payslip_not_found");
    return this.itemView(item, item.run, me);
  }

  /** One line of a run, for HR / accounting (their reach), e.g. to print a payslip. */
  async item(user: AuthenticatedUser, itemId: string): Promise<PayrollItemView> {
    const item = await this.repository.findItem(user.companyId, itemId);
    if (!item || !this.scope.covers(user, PERMISSIONS.PAYROLL_READ, { employeeId: item.employeeId, branchId: item.branchId })) {
      throw new NotFoundError("Payslip not found", "payroll.payslip_not_found");
    }
    const employee = (await this.employees.byIdsForRecords(user.companyId, [item.employeeId])).get(item.employeeId);
    return this.itemView(item, item.run, employee);
  }

  // ---------- calculating ----------

  async create(user: AuthenticatedUser, period: string, ip: string | null, idempotencyKey: string | undefined): Promise<PayrollRunDetail> {
    const { companyId } = user;
    this.assertCompanyReach(user, PERMISSIONS.PAYROLL_RUN);
    const currentMonth = companyDateOnly(this.clock.now()).toISOString().slice(0, 7);
    if (period > currentMonth) throw new BusinessRuleError("payroll.future_period", "Payroll can't be calculated for a future month");
    const work = async (): Promise<string> => {
      if (await this.repository.findRunByPeriod(companyId, period)) {
        throw new BusinessRuleError("payroll.run_exists", "This month already has a payroll run — recalculate it instead");
      }
      const { items, settings } = await this.compute(companyId, period);
      const run = await this.repository.createRun(companyId, {
        period,
        calculatedBy: user.userId,
        calculatedAt: this.clock.now(),
        settings: settings as unknown as Prisma.InputJsonValue,
      });
      await this.repository.replaceItems(companyId, run.id, items);
      await this.audit.record(companyId, { actorId: user.userId, action: "calculate", entity: "payroll_runs", entityId: run.id, after: { period, employees: items.length }, ip });
      return run.id;
    };
    try {
      const id = idempotencyKey
        ? await this.idempotency.run(companyId, user.userId, "payroll.create", idempotencyKey, hashRequest({ period }), work)
        : await this.db.transaction(companyId, work);
      return await this.get(user, id);
    } catch (error) {
      // Two creates for the same month at once: the unique (company, month) index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BusinessRuleError("payroll.run_exists", "This month already has a payroll run — recalculate it instead");
      }
      throw error;
    }
  }

  async recalculate(user: AuthenticatedUser, id: string, ip: string | null): Promise<PayrollRunDetail> {
    const { companyId } = user;
    this.assertCompanyReach(user, PERMISSIONS.PAYROLL_RUN);
    await this.db.transaction(companyId, async () => {
      const run = await this.locked(companyId, id);
      if (run.status !== "calculated") throw new BusinessRuleError("payroll.locked", "An approved payroll can't be changed");
      const { items, settings } = await this.compute(companyId, run.period);
      await this.repository.replaceItems(companyId, run.id, items);
      await this.repository.updateRun(companyId, run.id, {
        calculatedBy: user.userId,
        calculatedAt: this.clock.now(),
        settings: settings as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(companyId, { actorId: user.userId, action: "recalculate", entity: "payroll_runs", entityId: run.id, after: { employees: items.length }, ip });
    });
    return this.get(user, id);
  }

  async approve(user: AuthenticatedUser, id: string, ip: string | null): Promise<PayrollRunDetail> {
    const { companyId } = user;
    this.assertCompanyReach(user, PERMISSIONS.PAYROLL_APPROVE);
    const { run, employeeIds } = await this.db.transaction(companyId, async () => {
      const run = await this.locked(companyId, id);
      if (run.status !== "calculated") throw new BusinessRuleError("payroll.not_calculated", "This payroll was already approved");
      if (run.calculatedBy === user.userId) throw new ForbiddenError("Someone other than the person who calculated it must approve", "payroll.four_eyes");
      // Every day of the month must be closed (absences, lateness) before its pay is locked.
      if (companyDateOnly(this.clock.now()).getTime() <= monthBounds(run.period).to.getTime()) {
        throw new BusinessRuleError("payroll.month_not_over", "A month's payroll can be approved once the month has ended");
      }
      const items = await this.repository.listItems(companyId, [run.id], ALL);
      // Anything that changed since the calculation (attendance, leave, salary, employees, adjustments) must be in it:
      // calculate again now and refuse if any line would differ.
      const fresh = await this.compute(companyId, run.period);
      if (fingerprint(items) !== fingerprint(fresh.items)) {
        throw new BusinessRuleError("payroll.stale", "Something changed since the calculation — recalculate first");
      }
      const itemByEmployee = new Map(items.map((i) => [i.employeeId, i.id]));
      await this.repository.linkAdjustments(
        companyId,
        items.flatMap((i) =>
          (i.breakdown as unknown as PayrollItemBreakdown).adjustments.flatMap((a) => {
            const itemId = itemByEmployee.get(i.employeeId);
            return itemId ? [{ adjustmentId: a.id, itemId }] : [];
          }),
        ),
      );
      const approved = await this.repository.updateRun(companyId, run.id, { status: "approved", approvedBy: user.userId, approvedAt: this.clock.now() });
      await this.audit.record(companyId, {
        actorId: user.userId, action: "approve", entity: "payroll_runs", entityId: run.id,
        before: { status: "calculated" }, after: { status: "approved", employees: items.length }, ip,
      });
      return { run: approved, employeeIds: items.map((i) => i.employeeId) };
    });
    const userIds = [...(await this.employees.byIdsForRecords(companyId, employeeIds)).values()].flatMap((e) => (e.userId ? [e.userId] : []));
    await this.notify({ companyId, userIds, type: "payslip_ready", bodyParams: { period: run.period }, entity: "payroll_runs", entityId: run.id, link: "/payslips" });
    return this.get(user, id);
  }

  /** Techno Link workbook of an approved run (the lines in the caller's reach); the first export marks it exported. */
  async export(user: AuthenticatedUser, id: string, ip: string | null): Promise<{ period: string; buffer: Buffer }> {
    const { companyId } = user;
    const readScope = this.scope.scope(user, PERMISSIONS.PAYROLL_READ);
    if (!readScope) throw new NotFoundError("Payroll run not found", "payroll.not_found");
    const run = await this.db.transaction(companyId, async () => {
      const r = await this.locked(companyId, id);
      if (r.status === "calculated") throw new BusinessRuleError("payroll.not_approved", "Only an approved payroll can be exported");
      // Only a company-wide export marks the whole run exported; a branch user's export holds their lines only.
      const wholeCompany = readScope.all && this.scope.scope(user, PERMISSIONS.EXPORTS_CREATE)?.all === true;
      const updated =
        r.status === "approved" && wholeCompany
          ? await this.repository.updateRun(companyId, r.id, { status: "exported", exportedBy: user.userId, exportedAt: this.clock.now() })
          : r;
      await this.audit.record(companyId, { actorId: user.userId, action: "export", entity: "payroll_runs", entityId: r.id, after: { status: updated.status }, ip });
      return updated;
    });
    const detail = await this.get(user, run.id);
    // Full IBANs (bank transfer) only for people allowed to see personal data of that employee (ADR-0011 §3).
    const ibans = new Map(
      (await this.repository.listItems(companyId, [run.id], readScope)).flatMap((i) =>
        i.iban && this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, { employeeId: i.employeeId, branchId: i.branchId }) ? [[i.id, i.iban] as const] : [],
      ),
    );
    return { period: run.period, buffer: await buildPayrollWorkbook(run.period, detail.items, ibans) };
  }

  // ---------- the calculation ----------

  private async compute(companyId: string, period: string): Promise<{ items: NewPayrollItem[]; settings: PayrollSettings }> {
    const { from, to } = monthBounds(period);
    const periodDays = to.getUTCDate();
    const settings = await this.settingsOn(companyId, to);
    // The run covers the whole company; who may see which lines is decided when reading (branch snapshot).
    const everyone = await this.employees.list(companyId, { all: true });
    const employees = everyone.filter((e) => employedDaysIn(from, to, e.hireDate, e.endDate) > 0 && (e.status === "active" || e.endDate !== null));
    const ids = employees.map((e) => e.id);
    const lastDay = new Map(employees.map((e) => [e.id, e.endDate && e.endDate.getTime() < to.getTime() ? e.endDate : to]));
    const [components, attendance, leave, adjustments, calendar] = await Promise.all([
      this.salaries.byTypeOn(companyId, ids, lastDay),
      this.attendance.totals(companyId, ids, from, to),
      this.leave.leaveFor(companyId, employees, from, to),
      this.adjustments.list(companyId, { period, status: "approved", employeeIds: ids }),
      this.calendars.load(companyId),
    ]);
    const items = employees.map((e): NewPayrollItem => {
      const pay = components.get(e.id) ?? { basic: 0n, housing: 0n, transport: 0n, other: 0n };
      const att = attendance.get(e.id) ?? { absentDates: [], lateMinutes: 0 };
      const lv = leave.get(e.id) ?? { unpaidDays: 0, tieredPercents: [], daysByType: {}, dates: [] };
      // A day on approved leave (e.g. a corrected "absent" day later covered by sick leave) is priced as leave only;
      // days outside the employment are already left out by pro-rating.
      const onLeave = new Set(lv.dates);
      const absentDays = att.absentDates.filter((d) => !onLeave.has(d) && inEmployment(d, e)).length;
      const mine = adjustments.filter((a) => a.employeeId === e.id && !a.payrollItemId);
      const additions = mine.filter((a) => a.kind !== "deduction").reduce((sum, a) => sum + a.amountHalalas, 0n);
      const deductions = mine.filter((a) => a.kind === "deduction").reduce((sum, a) => sum + a.amountHalalas, 0n);
      const schedule = calendar.scheduleFor(e);
      const dayMinutes = schedule ? Math.max(0, minutesOf(schedule.endTime) - minutesOf(schedule.startTime)) || PAYROLL_DEFAULTS.dayMinutes : PAYROLL_DEFAULTS.dayMinutes;
      const employedDays = employedDaysIn(from, to, e.hireDate, e.endDate);
      const r = calculatePay({
        components: pay,
        periodDays,
        employedDays,
        absentDays,
        lateMinutes: att.lateMinutes,
        dayMinutes,
        unpaidLeaveDays: lv.unpaidDays,
        tieredLeavePercents: lv.tieredPercents,
        additions,
        deductions,
        gosi: {
          employeePercent: e.isSaudi ? settings.gosiSaudiEmployeePercent : settings.gosiNonSaudiEmployeePercent,
          employerPercent: e.isSaudi ? settings.gosiSaudiEmployerPercent : settings.gosiNonSaudiEmployerPercent,
          baseCap: BigInt(Math.round(settings.gosiBaseCapSar * 100)),
        },
        policy: { absenceIncludesHousing: settings.absenceIncludesHousing, latenessDeduction: settings.latenessDeduction, maxDeductionPercent: settings.maxDeductionPercent },
      });
      const warnings: PayrollWarning[] = [...r.warnings, ...(e.iban ? [] : (["no_iban"] as const))];
      const breakdown: PayrollItemBreakdown = {
        employedDays,
        absentDays,
        lateMinutes: att.lateMinutes,
        dayMinutes,
        unpaidLeaveDays: lv.unpaidDays,
        tieredLeaveDays: lv.tieredPercents.length,
        leaveDays: lv.daysByType,
        adjustments: mine.map((a) => ({ id: a.id, kind: a.kind as "deduction" | "bonus" | "allowance", amountHalalas: s(a.amountHalalas), reason: a.reason })),
        gosiBaseHalalas: s(r.gosiBase),
        saudi: e.isSaudi,
        warnings,
      };
      return {
        employeeId: e.id,
        branchId: e.branchId,
        paidDays: r.paidDays,
        basicHalalas: r.basic,
        housingHalalas: r.housing,
        transportHalalas: r.transport,
        otherHalalas: r.other,
        grossHalalas: r.gross,
        absenceHalalas: r.absence,
        latenessHalalas: r.lateness,
        unpaidLeaveHalalas: r.unpaidLeave,
        tieredLeaveHalalas: r.tieredLeave,
        additionsHalalas: r.additions,
        deductionsHalalas: r.deductions,
        gosiEmployeeHalalas: r.gosiEmployee,
        gosiEmployerHalalas: r.gosiEmployer,
        netHalalas: r.net,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        iban: e.iban,
      };
    });
    return { items, settings };
  }

  private async settingsOn(companyId: string, date: Date): Promise<PayrollSettings> {
    const K = COMPANY_SETTING_KEYS;
    const D = PAYROLL_DEFAULTS;
    const get = (key: string, fallback: number): Promise<number> => this.settings.getNumber(companyId, key, date, fallback);
    const [se, sr, ne, nr, cap, housing, late, maxDed] = await Promise.all([
      get(K.GOSI_SAUDI_EMPLOYEE_PERCENT, D.gosiSaudiEmployeePercent),
      get(K.GOSI_SAUDI_EMPLOYER_PERCENT, D.gosiSaudiEmployerPercent),
      get(K.GOSI_NON_SAUDI_EMPLOYEE_PERCENT, D.gosiNonSaudiEmployeePercent),
      get(K.GOSI_NON_SAUDI_EMPLOYER_PERCENT, D.gosiNonSaudiEmployerPercent),
      get(K.GOSI_BASE_CAP_SAR, D.gosiBaseCapSar),
      get(K.ABSENCE_INCLUDES_HOUSING, D.absenceIncludesHousing),
      get(K.LATENESS_DEDUCTION, D.latenessDeduction),
      get(K.MAX_DEDUCTION_PERCENT, DEFAULT_MAX_DEDUCTION_PERCENT),
    ]);
    return {
      gosiSaudiEmployeePercent: se,
      gosiSaudiEmployerPercent: sr,
      gosiNonSaudiEmployeePercent: ne,
      gosiNonSaudiEmployerPercent: nr,
      gosiBaseCapSar: cap,
      absenceIncludesHousing: housing !== 0,
      latenessDeduction: late !== 0,
      maxDeductionPercent: maxDed,
    };
  }

  // ---------- helpers ----------

  /** A run covers the whole company, so calculating and approving need company reach. */
  private assertCompanyReach(user: AuthenticatedUser, permission: string): void {
    if (!this.scope.scope(user, permission)?.all) throw new ForbiddenError("This needs company-wide access", "payroll.company_only");
  }

  private async locked(companyId: string, id: string): Promise<PayrollRun> {
    const run = await this.repository.lockRun(companyId, id);
    if (!run) throw new NotFoundError("Payroll run not found", "payroll.not_found");
    return run;
  }

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  private runView(user: AuthenticatedUser, run: PayrollRun, items: PayrollItem[]): PayrollRunView {
    const sum = (f: (i: PayrollItem) => bigint): string => s(items.reduce((acc, i) => acc + f(i), 0n));
    const totals: PayrollTotals = {
      employees: items.length,
      grossHalalas: sum((i) => i.grossHalalas),
      deductionsHalalas: sum((i) => i.absenceHalalas + i.latenessHalalas + i.unpaidLeaveHalalas + i.tieredLeaveHalalas + i.deductionsHalalas),
      additionsHalalas: sum((i) => i.additionsHalalas),
      gosiEmployeeHalalas: sum((i) => i.gosiEmployeeHalalas),
      gosiEmployerHalalas: sum((i) => i.gosiEmployerHalalas),
      netHalalas: sum((i) => i.netHalalas),
      warnings: items.filter((i) => (i.breakdown as unknown as PayrollItemBreakdown).warnings.length > 0).length,
    };
    const company = (p: string): boolean => this.scope.scope(user, p)?.all === true;
    const end = monthBounds(run.period).to;
    const approvableFrom = new Date(end.getTime() + 86_400_000);
    const monthOver = companyDateOnly(this.clock.now()).getTime() >= approvableFrom.getTime();
    return {
      id: run.id,
      period: run.period,
      status: run.status as PayrollRunView["status"],
      calculatedAt: run.calculatedAt.toISOString(),
      approvedAt: run.approvedAt?.toISOString() ?? null,
      exportedAt: run.exportedAt?.toISOString() ?? null,
      totals,
      canRecalculate: run.status === "calculated" && company(PERMISSIONS.PAYROLL_RUN),
      canApprove: run.status === "calculated" && monthOver && company(PERMISSIONS.PAYROLL_APPROVE) && run.calculatedBy !== user.userId,
      approvableFrom: approvableFrom.toISOString().slice(0, 10),
      canExport: run.status !== "calculated" && this.scope.scope(user, PERMISSIONS.EXPORTS_CREATE) !== null,
    };
  }

  private itemView(i: PayrollItem, run: PayrollRun, e: Employee | undefined | null): PayrollItemView {
    return {
      id: i.id,
      runId: run.id,
      period: run.period,
      status: run.status as PayrollItemView["status"],
      employee: e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn, jobTitle: e.jobTitle } : null,
      branchId: i.branchId,
      paidDays: i.paidDays,
      basicHalalas: s(i.basicHalalas),
      housingHalalas: s(i.housingHalalas),
      transportHalalas: s(i.transportHalalas),
      otherHalalas: s(i.otherHalalas),
      grossHalalas: s(i.grossHalalas),
      absenceHalalas: s(i.absenceHalalas),
      latenessHalalas: s(i.latenessHalalas),
      unpaidLeaveHalalas: s(i.unpaidLeaveHalalas),
      tieredLeaveHalalas: s(i.tieredLeaveHalalas),
      additionsHalalas: s(i.additionsHalalas),
      deductionsHalalas: s(i.deductionsHalalas),
      gosiEmployeeHalalas: s(i.gosiEmployeeHalalas),
      gosiEmployerHalalas: s(i.gosiEmployerHalalas),
      netHalalas: s(i.netHalalas),
      ibanMasked: maskIban(i.iban),
      breakdown: i.breakdown as unknown as PayrollItemBreakdown,
    };
  }

  /** The decision is saved — a notification hiccup never turns it into an error. */
  private async notify(event: NotifyUsersEvent): Promise<void> {
    if (event.userIds.length === 0) return;
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${event.type} ${event.entityId}`, error as Error);
    }
  }
}
