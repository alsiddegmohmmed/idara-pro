import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee, ShortLeaveRequest } from "@prisma/client";
import { COMPANY_SETTING_KEYS, PERMISSIONS, type CreateShortLeave, type ShortLeaveAllowance, type ShortLeaveView } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { CompanyCalendarLoader, CompanySettingsService } from "../../company";
import { EmployeeScopeService, EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { monthOf, remainingAllowance, shortLeaveMinutes, timesOverlap } from "../domain/discipline-rules";
import { DISCIPLINE_REPOSITORY, type DisciplineRepositoryPort } from "./ports/discipline-repository.port";

/** Policy TBD (business-rules.md) — a company setting overrides it. */
export const DEFAULT_SHORTLEAVE_MONTHLY_MINUTES = 240;
/** A forgotten request can still be filed this many days later. */
const MAX_DAYS_BACK = 7;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const ref = (e: Employee | undefined | null) => (e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn } : null);
const toView = (r: ShortLeaveRequest, e: Employee | undefined | null): ShortLeaveView => ({
  id: r.id,
  employee: ref(e),
  date: iso(r.date),
  kind: r.kind as ShortLeaveView["kind"],
  fromTime: r.fromTime,
  toTime: r.toTime,
  minutes: r.minutes,
  reason: r.reason,
  status: r.status as ShortLeaveView["status"],
  decisionNote: r.decisionNote,
  createdAt: r.createdAt.toISOString(),
});

/** Payload of "shortleave.approved" — attendance excuses the lateness in the same transaction. */
export interface ShortLeaveApprovedEvent {
  companyId: string;
  employeeId: string;
  branchId: string | null;
  date: string;
  kind: string;
  minutes: number;
}

/**
 * الاستئذانات (business-rules.md "Short permissions"): part of a working day, within a monthly allowance
 * (setting, default 4 hours). Whoever holds shortleave:approve in reach of the request's branch decides —
 * first decision wins, never your own. An approved late arrival excuses that lateness in attendance.
 */
@Injectable()
export class ShortLeaveService {
  private readonly logger = new Logger(ShortLeaveService.name);

  constructor(
    @Inject(DISCIPLINE_REPOSITORY) private readonly repository: DisciplineRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: EmployeeScopeService,
    private readonly settings: CompanySettingsService,
    private readonly calendars: CompanyCalendarLoader,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async allowance(user: AuthenticatedUser, month?: string): Promise<ShortLeaveAllowance> {
    const me = await this.me(user);
    return this.allowanceFor(user.companyId, me.id, month ?? monthOf(this.today()));
  }

  private async allowanceFor(companyId: string, employeeId: string, month: string): Promise<ShortLeaveAllowance> {
    const from = new Date(`${month}-01T00:00:00.000Z`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const rows = await this.repository.listShortLeave(companyId, { employeeIds: [employeeId], from, to });
    const sum = (status: string) => rows.filter((r) => r.status === status).reduce((n, r) => n + r.minutes, 0);
    const allowanceMinutes = await this.settings.getNumber(companyId, COMPANY_SETTING_KEYS.SHORTLEAVE_MONTHLY_MINUTES, from, DEFAULT_SHORTLEAVE_MONTHLY_MINUTES);
    const usedMinutes = sum("approved");
    const pendingMinutes = sum("pending");
    return { month, allowanceMinutes, usedMinutes, pendingMinutes, remainingMinutes: remainingAllowance(allowanceMinutes, usedMinutes, pendingMinutes) };
  }

  async create(user: AuthenticatedUser, input: CreateShortLeave, ip: string | null): Promise<ShortLeaveView> {
    const { companyId } = user;
    const me = await this.me(user);
    if (me.status !== "active") throw new BusinessRuleError("shortleave.employee_inactive", "Inactive employees cannot request");
    const date = new Date(`${input.date}T00:00:00.000Z`);
    const today = this.today();
    if (date.getTime() < today.getTime() - MAX_DAYS_BACK * 86_400_000) {
      throw new BusinessRuleError("shortleave.too_old", `A request can be filed at most ${MAX_DAYS_BACK} days later`);
    }
    const calendar = await this.calendars.load(companyId);
    if (calendar.kindOf(me, date) !== "working") throw new BusinessRuleError("shortleave.not_working_day", "That day is not a working day");
    const minutes = shortLeaveMinutes(input.fromTime, input.toTime);

    const created = await this.db.transaction(companyId, async () => {
      await this.repository.lockEmployee(companyId, me.id);
      const sameDay = await this.repository.listShortLeave(companyId, { employeeIds: [me.id], from: date, to: date });
      if (sameDay.some((r) => (r.status === "pending" || r.status === "approved") && timesOverlap(r, input))) {
        throw new BusinessRuleError("shortleave.overlap", "Overlaps another request on that day");
      }
      const allowance = await this.allowanceFor(companyId, me.id, monthOf(date));
      if (minutes > allowance.remainingMinutes) {
        throw new BusinessRuleError("shortleave.allowance_exceeded", "Not enough short-permission allowance left this month", {
          remaining: allowance.remainingMinutes,
          requested: minutes,
        });
      }
      const r = await this.repository.createShortLeave(companyId, {
        employeeId: me.id,
        branchId: me.branchId,
        date,
        kind: input.kind,
        fromTime: input.fromTime,
        toTime: input.toTime,
        minutes,
        reason: input.reason,
      });
      await this.audit.record(companyId, { actorId: user.userId, action: "create", entity: "shortleave_requests", entityId: r.id, after: toAuditSnapshot(r), ip });
      return r;
    });
    const approvers = await this.scope
      .eligibleUsers(companyId, PERMISSIONS.SHORTLEAVE_APPROVE, { employeeId: me.id, branchId: created.branchId }, me.userId)
      .catch(() => []);
    await this.notify(companyId, approvers, "shortleave_requested", created, me, "/short-permissions?tab=approvals");
    return toView(created, me);
  }

  async mine(user: AuthenticatedUser): Promise<ShortLeaveView[]> {
    const me = await this.me(user);
    return (await this.repository.listShortLeave(user.companyId, { employeeIds: [me.id] })).map((r) => toView(r, me));
  }

  async cancel(user: AuthenticatedUser, id: string, ip: string | null): Promise<ShortLeaveView> {
    const me = await this.me(user);
    const r = await this.db.transaction(user.companyId, async () => {
      const before = await this.locked(user.companyId, id);
      if (before.employeeId !== me.id) throw new NotFoundError("Request not found", "shortleave.not_found");
      if (before.status !== "pending") throw new BusinessRuleError("shortleave.not_pending", "Only a pending request can be cancelled");
      const r = await this.repository.updateShortLeave(user.companyId, id, { status: "cancelled" });
      await this.audit.record(user.companyId, { actorId: user.userId, action: "cancel", entity: "shortleave_requests", entityId: id, ip });
      return r;
    });
    return toView(r, me);
  }

  async list(user: AuthenticatedUser, q: { status?: string; employeeId?: string }): Promise<ShortLeaveView[]> {
    const readScope = this.scope.scope(user, PERMISSIONS.SHORTLEAVE_READ);
    if (!readScope) return [];
    const rows = await this.repository.listShortLeave(user.companyId, { scope: readScope, status: q.status, employeeIds: q.employeeId ? [q.employeeId] : undefined });
    const employees = await this.employees.byIdsForRecords(user.companyId, rows.map((r) => r.employeeId));
    return rows.map((r) => {
      const e = employees.get(r.employeeId);
      return {
        ...toView(r, e),
        canDecide:
          r.status === "pending" && e?.userId !== user.userId && this.scope.covers(user, PERMISSIONS.SHORTLEAVE_APPROVE, { employeeId: r.employeeId, branchId: r.branchId }),
      };
    });
  }

  async approve(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<ShortLeaveView> {
    return this.decide(user, id, "approved", note, ip);
  }

  async reject(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<ShortLeaveView> {
    return this.decide(user, id, "rejected", note, ip);
  }

  private async decide(user: AuthenticatedUser, id: string, to: "approved" | "rejected", note: string | undefined, ip: string | null): Promise<ShortLeaveView> {
    const { companyId } = user;
    const { r, employee } = await this.db.transaction(companyId, async () => {
      const before = await this.locked(companyId, id);
      const employee = await this.employees.findById(companyId, before.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot decide your own request", "shortleave.own_request");
      this.scope.assertCanAccess(user, PERMISSIONS.SHORTLEAVE_APPROVE, { employeeId: employee.id, branchId: before.branchId }, "shortleave.out_of_scope");
      if (before.status !== "pending") throw new BusinessRuleError("shortleave.not_pending", "This request was already decided");
      const r = await this.repository.updateShortLeave(companyId, id, { status: to, decidedBy: user.userId, decidedAt: this.clock.now(), decisionNote: note?.trim() || null });
      if (to === "approved") {
        const event: ShortLeaveApprovedEvent = { companyId, employeeId: r.employeeId, branchId: r.branchId, date: iso(r.date), kind: r.kind, minutes: r.minutes };
        const handled = await this.events.emitAsync("shortleave.approved", event);
        if (handled.length === 0) throw new Error('No listener handled "shortleave.approved"');
      }
      await this.audit.record(companyId, {
        actorId: user.userId, action: to === "approved" ? "approve" : "reject", entity: "shortleave_requests", entityId: id,
        before: { status: "pending" }, after: { status: to, note: r.decisionNote }, ip,
      });
      return { r, employee };
    });
    if (employee.userId) await this.notify(companyId, [employee.userId], `shortleave_${to}`, r, employee, "/short-permissions");
    return toView(r, employee);
  }

  private async locked(companyId: string, id: string): Promise<ShortLeaveRequest> {
    const r = await this.repository.lockShortLeave(companyId, id);
    if (!r) throw new NotFoundError("Request not found", "shortleave.not_found");
    return r;
  }

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  private today(): Date {
    return companyDateOnly(this.clock.now());
  }

  private async notify(companyId: string, userIds: string[], type: string, r: ShortLeaveRequest, e: Employee, link: string): Promise<void> {
    if (userIds.length === 0) return;
    const event: NotifyUsersEvent = {
      companyId,
      userIds,
      type,
      bodyParams: {
        employeeNameAr: e.fullNameAr,
        employeeNameEn: e.fullNameEn,
        date: iso(r.date),
        fromTime: r.fromTime,
        toTime: r.toTime,
        minutes: r.minutes,
        note: r.decisionNote,
      },
      entity: "shortleave_requests",
      entityId: r.id,
      link,
    };
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${type} ${r.id}`, error as Error);
    }
  }
}
