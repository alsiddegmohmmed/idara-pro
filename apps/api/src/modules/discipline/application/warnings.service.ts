import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee, Warning } from "@prisma/client";
import {
  COMPANY_SETTING_KEYS,
  PERMISSIONS,
  WARNING_OBJECTION_DAYS,
  type IssueWarning,
  type ProposeWarning,
  type WarningStatement,
  type WarningView,
} from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { CompanySettingsService } from "../../company";
import { EmployeeScopeService, EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { isWarningActive } from "../domain/discipline-rules";
import { DISCIPLINE_REPOSITORY, type DisciplineRepositoryPort } from "./ports/discipline-repository.port";

/** Policy TBD (business-rules.md) — a company setting overrides it. */
export const DEFAULT_WARNING_ACTIVE_DAYS = 180;

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const ref = (e: Employee | undefined | null) => (e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn } : null);

/**
 * إنذارات (business-rules.md "Warnings"): proposed by a manager/HR (warnings:propose) → issued or rejected by
 * HR (warnings:issue) → acknowledged by the employee in the app; HR can rescind an issued one with a reason
 * (warnings:rescind). Every step is scoped by the warning's branch snapshot, audited and notified. Nobody
 * handles a warning about themselves. A warning never creates a deduction by itself.
 */
@Injectable()
export class WarningsService {
  private readonly logger = new Logger(WarningsService.name);

  constructor(
    @Inject(DISCIPLINE_REPOSITORY) private readonly repository: DisciplineRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: EmployeeScopeService,
    private readonly settings: CompanySettingsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async propose(user: AuthenticatedUser, input: ProposeWarning, ip: string | null): Promise<WarningView> {
    const { companyId } = user;
    const employee = await this.scope.assertEmployee(user, PERMISSIONS.WARNINGS_PROPOSE, input.employeeId, "warnings.out_of_scope");
    if (employee.userId === user.userId) throw new ForbiddenError("You cannot propose a warning about yourself", "warnings.own");
    const incident = new Date(`${input.incidentDate}T00:00:00.000Z`);
    if (incident.getTime() > this.today().getTime()) throw new BusinessRuleError("warnings.future_incident", "The incident date can't be in the future");
    const created = await this.db.transaction(companyId, async () => {
      const w = await this.repository.createWarning(companyId, {
        employeeId: employee.id,
        branchId: employee.branchId,
        type: input.type,
        reason: input.reason,
        incidentDate: incident,
        proposedBy: user.userId,
      });
      await this.audit.record(companyId, { actorId: user.userId, action: "propose", entity: "warnings", entityId: w.id, after: toAuditSnapshot(w), ip });
      return w;
    });
    const issuers = (await this.scope.eligibleUsers(companyId, PERMISSIONS.WARNINGS_ISSUE, { employeeId: employee.id, branchId: created.branchId }, employee.userId))
      .filter((id) => id !== user.userId);
    await this.notify(companyId, issuers, "warning_proposed", created, employee, "/discipline");
    return this.toView(user, created, employee, await this.activeDays(companyId));
  }

  async list(user: AuthenticatedUser, q: { status?: string; employeeId?: string }): Promise<WarningView[]> {
    const readScope = this.scope.scope(user, PERMISSIONS.WARNINGS_READ);
    if (!readScope) return [];
    const rows = await this.repository.listWarnings(user.companyId, { scope: readScope, status: q.status, employeeIds: q.employeeId ? [q.employeeId] : undefined });
    const employees = await this.employees.byIdsForRecords(user.companyId, rows.map((w) => w.employeeId));
    const days = await this.activeDays(user.companyId);
    const proposers = await this.proposers(user.companyId, rows);
    return rows.map((w) => this.toView(user, w, employees.get(w.employeeId), days, proposers));
  }

  /**
   * HR records what the employee said about the incident — or that they were asked and declined — before
   * the warning is issued (Labor Law art. 71: no penalty without hearing the worker).
   */
  async recordStatement(user: AuthenticatedUser, id: string, input: WarningStatement, ip: string | null): Promise<WarningView> {
    const { companyId } = user;
    const { w, employee } = await this.db.transaction(companyId, async () => {
      const before = await this.locked(companyId, id);
      const employee = await this.employees.findById(companyId, before.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot handle a warning about yourself", "warnings.own");
      this.scope.assertCanAccess(user, PERMISSIONS.WARNINGS_ISSUE, { employeeId: employee.id, branchId: before.branchId }, "warnings.out_of_scope");
      if (before.status !== "proposed") throw new BusinessRuleError("warnings.not_proposed", "This warning was already decided");
      const w = await this.repository.updateWarning(companyId, id, this.statementData(user, input));
      await this.audit.record(companyId, {
        actorId: user.userId, action: "record_statement", entity: "warnings", entityId: id,
        before: { statement: before.employeeStatement, declined: before.statementDeclined }, after: { statement: w.employeeStatement, declined: w.statementDeclined }, ip,
      });
      return { w, employee };
    });
    return this.toView(user, w, employee, await this.activeDays(companyId), await this.proposers(companyId, [w]));
  }

  private statementData(user: AuthenticatedUser, input: { statement?: string; statementDeclined?: boolean }): Partial<Warning> {
    return {
      employeeStatement: input.statementDeclined ? null : (input.statement?.trim() ?? null),
      statementDeclined: Boolean(input.statementDeclined),
      statementRecordedBy: user.userId,
      statementRecordedAt: this.clock.now(),
    };
  }

  private async proposers(companyId: string, rows: Warning[]): Promise<Map<string, Employee>> {
    const ids = [...new Set(rows.map((w) => w.proposedBy))];
    return new Map((await this.employees.byUserIds(companyId, ids)).filter((e) => e.userId).map((e) => [e.userId as string, e]));
  }

  /** The employee's own issued (and rescinded) warnings — proposals and rejections are not theirs to see. */
  async mine(user: AuthenticatedUser): Promise<WarningView[]> {
    const me = await this.me(user);
    const rows = await this.repository.listWarnings(user.companyId, { employeeIds: [me.id], statuses: ["issued", "rescinded"] });
    const days = await this.activeDays(user.companyId);
    return rows.map((w) => this.toView(user, w, me, days));
  }

  /** Issuing needs the employee's statement (or that they declined): recorded earlier, or sent with the decision. */
  async issue(user: AuthenticatedUser, id: string, input: IssueWarning, ip: string | null): Promise<WarningView> {
    return this.decide(user, id, "issued", input.note, ip, input);
  }

  async reject(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<WarningView> {
    return this.decide(user, id, "rejected", note, ip);
  }

  private async decide(
    user: AuthenticatedUser,
    id: string,
    to: "issued" | "rejected",
    note: string | undefined,
    ip: string | null,
    statement: { statement?: string; statementDeclined?: boolean } = {},
  ): Promise<WarningView> {
    const { companyId } = user;
    const { w, employee } = await this.db.transaction(companyId, async () => {
      const before = await this.locked(companyId, id);
      const employee = await this.employees.findById(companyId, before.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot decide a warning about yourself", "warnings.own");
      this.scope.assertCanAccess(user, PERMISSIONS.WARNINGS_ISSUE, { employeeId: employee.id, branchId: before.branchId }, "warnings.out_of_scope");
      if (before.status !== "proposed") throw new BusinessRuleError("warnings.not_proposed", "This warning was already decided");
      const given = Boolean(statement.statement || statement.statementDeclined);
      if (to === "issued" && !given && !before.statementRecordedAt) {
        throw new BusinessRuleError("warnings.statement_required", "Record the employee's statement (or that they declined) before issuing");
      }
      const w = await this.repository.updateWarning(companyId, id, {
        status: to,
        decidedBy: user.userId,
        decidedAt: this.clock.now(),
        decisionNote: note?.trim() || null,
        ...(to === "issued" && given ? this.statementData(user, statement) : {}),
      });
      await this.audit.record(companyId, {
        actorId: user.userId, action: to === "issued" ? "issue" : "reject", entity: "warnings", entityId: id,
        before: { status: before.status }, after: { status: w.status, note: w.decisionNote }, ip,
      });
      return { w, employee };
    });
    if (to === "issued" && employee.userId) await this.notify(companyId, [employee.userId], "warning_issued", w, employee, "/profile?section=warnings");
    if (to === "rejected" && w.proposedBy !== user.userId) await this.notify(companyId, [w.proposedBy], "warning_rejected", w, employee, "/discipline");
    return this.toView(user, w, employee, await this.activeDays(companyId), await this.proposers(companyId, [w]));
  }

  async rescind(user: AuthenticatedUser, id: string, reason: string, ip: string | null): Promise<WarningView> {
    const { companyId } = user;
    const { w, employee } = await this.db.transaction(companyId, async () => {
      const before = await this.locked(companyId, id);
      const employee = await this.employees.findById(companyId, before.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot rescind a warning about yourself", "warnings.own");
      this.scope.assertCanAccess(user, PERMISSIONS.WARNINGS_RESCIND, { employeeId: employee.id, branchId: before.branchId }, "warnings.out_of_scope");
      if (before.status !== "issued") throw new BusinessRuleError("warnings.not_issued", "Only an issued warning can be rescinded");
      const w = await this.repository.updateWarning(companyId, id, { status: "rescinded", rescindedBy: user.userId, rescindedAt: this.clock.now(), rescindedReason: reason.trim() });
      await this.audit.record(companyId, { actorId: user.userId, action: "rescind", entity: "warnings", entityId: id, before: { status: "issued" }, after: { status: "rescinded", reason }, ip });
      return { w, employee };
    });
    if (employee.userId) await this.notify(companyId, [employee.userId], "warning_rescinded", w, employee, "/profile?section=warnings");
    return this.toView(user, w, employee, await this.activeDays(companyId));
  }

  /** The employee confirms they have seen it (not that they agree). */
  async acknowledge(user: AuthenticatedUser, id: string, ip: string | null): Promise<WarningView> {
    const { companyId } = user;
    const me = await this.me(user);
    const w = await this.db.transaction(companyId, async () => {
      const before = await this.locked(companyId, id);
      if (before.employeeId !== me.id) throw new NotFoundError("Warning not found", "warnings.not_found");
      if (before.status !== "issued") throw new BusinessRuleError("warnings.not_issued", "Only an issued warning can be acknowledged");
      if (before.acknowledgedAt) return before;
      const w = await this.repository.updateWarning(companyId, id, { acknowledgedAt: this.clock.now() });
      await this.audit.record(companyId, { actorId: user.userId, action: "acknowledge", entity: "warnings", entityId: id, ip });
      return w;
    });
    return this.toView(user, w, me, await this.activeDays(companyId));
  }

  private async locked(companyId: string, id: string): Promise<Warning> {
    const w = await this.repository.lockWarning(companyId, id);
    if (!w) throw new NotFoundError("Warning not found", "warnings.not_found");
    return w;
  }

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  private today(): Date {
    return companyDateOnly(this.clock.now());
  }

  private activeDays(companyId: string): Promise<number> {
    return this.settings.getNumber(companyId, COMPANY_SETTING_KEYS.WARNING_ACTIVE_DAYS, this.today(), DEFAULT_WARNING_ACTIVE_DAYS);
  }

  private toView(user: AuthenticatedUser, w: Warning, employee: Employee | undefined | null, activeDays: number, proposers?: Map<string, Employee>): WarningView {
    const proposer = proposers?.get(w.proposedBy);
    const decidedOn = w.decidedAt ? companyDateOnly(w.decidedAt) : null;
    const target = { employeeId: w.employeeId, branchId: w.branchId };
    const own = employee?.userId === user.userId;
    const actions: WarningView["actions"] = [];
    if (own && w.status === "issued" && !w.acknowledgedAt) actions.push("acknowledge");
    if (!own && w.status === "proposed" && this.scope.covers(user, PERMISSIONS.WARNINGS_ISSUE, target)) actions.push("issue", "reject");
    if (!own && w.status === "issued" && this.scope.covers(user, PERMISSIONS.WARNINGS_RESCIND, target)) actions.push("rescind");
    return {
      id: w.id,
      employee: ref(employee),
      type: w.type as WarningView["type"],
      reason: w.reason,
      incidentDate: iso(w.incidentDate) as string,
      status: w.status as WarningView["status"],
      decidedAt: w.decidedAt?.toISOString() ?? null,
      decisionNote: w.decisionNote,
      acknowledgedAt: w.acknowledgedAt?.toISOString() ?? null,
      rescindedAt: w.rescindedAt?.toISOString() ?? null,
      rescindedReason: w.rescindedReason,
      active: isWarningActive(w, activeDays, this.today()),
      createdAt: w.createdAt.toISOString(),
      proposedBy: proposer ? { fullNameAr: proposer.fullNameAr, fullNameEn: proposer.fullNameEn } : null,
      statement: w.statementRecordedAt ? { text: w.employeeStatement, declined: w.statementDeclined, recordedAt: w.statementRecordedAt.toISOString() } : null,
      objectionUntil:
        w.status === "issued" && decidedOn ? new Date(decidedOn.getTime() + WARNING_OBJECTION_DAYS * 86_400_000).toISOString().slice(0, 10) : null,
      actions,
    };
  }

  /** The decision is saved — a notification hiccup never turns it into an error. */
  private async notify(companyId: string, userIds: string[], type: string, w: Warning, e: Employee, link: string): Promise<void> {
    if (userIds.length === 0) return;
    const event: NotifyUsersEvent = {
      companyId,
      userIds,
      type,
      bodyParams: { employeeNameAr: e.fullNameAr, employeeNameEn: e.fullNameEn, warningType: w.type, date: iso(w.incidentDate), note: w.rescindedReason ?? w.decisionNote },
      entity: "warnings",
      entityId: w.id,
      link,
    };
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${type} ${w.id}`, error as Error);
    }
  }
}
