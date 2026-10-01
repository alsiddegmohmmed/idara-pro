import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee, PayrollAdjustment } from "@prisma/client";
import { COMPANY_SETTING_KEYS, PERMISSIONS, type AdjustmentListQuery, type AdjustmentView, type ProposeAdjustment } from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { CompanySettingsService } from "../../company";
import { EmployeeScopeService, EmployeesService, SalaryComponentsService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { assertPeriodOpen, assertWithinDeductionCap } from "../domain/adjustment-rules";
import { ADJUSTMENTS_REPOSITORY, type AdjustmentsRepositoryPort } from "./ports/adjustments-repository.port";
import { PAYROLL_RUNS_REPOSITORY, type PayrollRunsRepositoryPort } from "./ports/payroll-runs-repository.port";

/** Labor Law default — confirm with HR/legal; a company setting overrides it. */
export const DEFAULT_MAX_DEDUCTION_PERCENT = 50;

const ref = (e: Employee | undefined | null) => (e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn } : null);

/**
 * Pay adjustments (business-rules.md "Adjustments and deductions"): a deduction, bonus or allowance for one
 * employee and month, proposed (adjustments:propose) and approved by a *different* person
 * (adjustments:approve); approved rows are immutable and feed payroll (Phase 7). Deductions respect the
 * monthly legal cap. Scoped by the record's branch snapshot; audited; approvers notified.
 */
@Injectable()
export class AdjustmentsService {
  private readonly logger = new Logger(AdjustmentsService.name);

  constructor(
    @Inject(ADJUSTMENTS_REPOSITORY) private readonly repository: AdjustmentsRepositoryPort,
    @Inject(PAYROLL_RUNS_REPOSITORY) private readonly runs: PayrollRunsRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly salaries: SalaryComponentsService,
    private readonly scope: EmployeeScopeService,
    private readonly settings: CompanySettingsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async propose(user: AuthenticatedUser, input: ProposeAdjustment, ip: string | null): Promise<AdjustmentView> {
    const { companyId } = user;
    const employee = await this.scope.assertEmployee(user, PERMISSIONS.ADJUSTMENTS_PROPOSE, input.employeeId, "adjustments.out_of_scope");
    if (employee.userId === user.userId) throw new ForbiddenError("You cannot propose an adjustment for yourself", "adjustments.own");
    assertPeriodOpen(input.period, companyDateOnly(this.clock.now()).toISOString().slice(0, 7));
    await this.assertPayrollOpen(companyId, input.period);
    const created = await this.db.transaction(companyId, async () => {
      const a = await this.repository.create(companyId, {
        employeeId: employee.id,
        branchId: employee.branchId,
        period: input.period,
        kind: input.kind,
        amountHalalas: BigInt(input.amountHalalas),
        reason: input.reason,
        source: input.source,
        sourceId: input.sourceId ?? null,
        proposedBy: user.userId,
      });
      await this.audit.record(companyId, {
        actorId: user.userId, action: "propose", entity: "payroll_adjustments", entityId: a.id,
        after: { employeeId: a.employeeId, period: a.period, kind: a.kind, amountHalalas: input.amountHalalas, reason: a.reason, source: a.source },
        ip,
      });
      return a;
    });
    const approvers = (
      await this.scope.eligibleUsers(companyId, PERMISSIONS.ADJUSTMENTS_APPROVE, { employeeId: employee.id, branchId: created.branchId }, employee.userId).catch(() => [])
    ).filter((id) => id !== user.userId);
    await this.notify(companyId, approvers, "adjustment_proposed", created, employee);
    return this.toView(user, created, employee);
  }

  /** Once a month's payroll is approved nothing more can be paid in it — use a later month. */
  private async assertPayrollOpen(companyId: string, period: string): Promise<void> {
    const run = await this.runs.findRunByPeriod(companyId, period);
    if (run && run.status !== "calculated") throw new BusinessRuleError("adjustments.period_closed", "That month's payroll is already approved");
  }

  async list(user: AuthenticatedUser, q: AdjustmentListQuery): Promise<AdjustmentView[]> {
    const readScope = this.scope.scope(user, PERMISSIONS.ADJUSTMENTS_READ);
    if (!readScope) return [];
    const rows = await this.repository.list(user.companyId, { scope: readScope, period: q.period, status: q.status, employeeIds: q.employeeId ? [q.employeeId] : undefined });
    const employees = await this.employees.byIdsForRecords(user.companyId, rows.map((a) => a.employeeId));
    return rows.map((a) => this.toView(user, a, employees.get(a.employeeId)));
  }

  async approve(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<AdjustmentView> {
    return this.decide(user, id, "approved", note, ip);
  }

  async reject(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<AdjustmentView> {
    return this.decide(user, id, "rejected", note, ip);
  }

  private async decide(user: AuthenticatedUser, id: string, to: "approved" | "rejected", note: string | undefined, ip: string | null): Promise<AdjustmentView> {
    const { companyId } = user;
    const { a, employee } = await this.db.transaction(companyId, async () => {
      const before = await this.repository.lock(companyId, id);
      if (!before) throw new NotFoundError("Adjustment not found", "adjustments.not_found");
      const employee = await this.employees.findById(companyId, before.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot decide your own adjustment", "adjustments.own");
      if (before.proposedBy === user.userId) throw new ForbiddenError("Someone else must approve what you proposed", "adjustments.four_eyes");
      this.scope.assertCanAccess(user, PERMISSIONS.ADJUSTMENTS_APPROVE, { employeeId: employee.id, branchId: before.branchId }, "adjustments.out_of_scope");
      if (before.status !== "proposed") throw new BusinessRuleError("adjustments.not_proposed", "This adjustment was already decided");
      if (to === "approved") await this.assertPayrollOpen(companyId, before.period);
      if (to === "approved" && before.kind === "deduction") {
        await this.repository.lockEmployee(companyId, employee.id); // concurrent approvals can't both slip under the cap
        const firstDay = new Date(`${before.period}-01T00:00:00.000Z`);
        const cap = await this.settings.getNumber(companyId, COMPANY_SETTING_KEYS.MAX_DEDUCTION_PERCENT, firstDay, DEFAULT_MAX_DEDUCTION_PERCENT);
        assertWithinDeductionCap(
          await this.salaries.monthlyTotalOn(companyId, employee.id, firstDay),
          await this.repository.approvedDeductions(companyId, employee.id, before.period),
          before.amountHalalas,
          cap,
        );
      }
      const a = await this.repository.decide(companyId, id, { status: to, decidedBy: user.userId, decidedAt: this.clock.now(), decisionNote: note?.trim() || null });
      await this.audit.record(companyId, {
        actorId: user.userId, action: to === "approved" ? "approve" : "reject", entity: "payroll_adjustments", entityId: id,
        before: { status: "proposed" }, after: { status: to, note: a.decisionNote }, ip,
      });
      return { a, employee };
    });
    await this.notify(companyId, [a.proposedBy], `adjustment_${to}`, a, employee);
    return this.toView(user, a, employee);
  }

  private toView(user: AuthenticatedUser, a: PayrollAdjustment, e: Employee | undefined | null): AdjustmentView {
    return {
      id: a.id,
      employee: ref(e),
      period: a.period,
      kind: a.kind as AdjustmentView["kind"],
      amountHalalas: a.amountHalalas.toString(),
      reason: a.reason,
      source: a.source as AdjustmentView["source"],
      sourceId: a.sourceId,
      status: a.status as AdjustmentView["status"],
      decisionNote: a.decisionNote,
      createdAt: a.createdAt.toISOString(),
      canDecide:
        a.status === "proposed" &&
        a.proposedBy !== user.userId &&
        e?.userId !== user.userId &&
        this.scope.covers(user, PERMISSIONS.ADJUSTMENTS_APPROVE, { employeeId: a.employeeId, branchId: a.branchId }),
    };
  }

  private async notify(companyId: string, userIds: string[], type: string, a: PayrollAdjustment, e: Employee): Promise<void> {
    if (userIds.length === 0) return;
    const event: NotifyUsersEvent = {
      companyId,
      userIds,
      type,
      bodyParams: { employeeNameAr: e.fullNameAr, employeeNameEn: e.fullNameEn, kind: a.kind, amountHalalas: a.amountHalalas.toString(), period: a.period, note: a.decisionNote },
      entity: "payroll_adjustments",
      entityId: a.id,
      link: "/adjustments",
    };
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${type} ${a.id}`, error as Error);
    }
  }
}
