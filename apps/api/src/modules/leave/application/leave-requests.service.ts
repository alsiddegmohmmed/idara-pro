import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PERMISSIONS, type CreateLeaveRequest, type SetLeaveEntitlement } from "@idara-pro/shared";
import type { Employee, LeaveType } from "@prisma/client";
import { AuditService } from "../../audit";
import { UsersRepository } from "../../auth";
import { CompanyCalendarLoader, type CompanyCalendar } from "../../company";
import { EmployeeScopeService, EmployeesService } from "../../employees";
import { eachDate, isoDate } from "../../../shared/calendar/work-calendar";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { availableDays, sameYear, workingDaysIn } from "../domain/leave-rules";
import { toRequestDto, toTypeDto, type BalanceDto, type LeaveRequestDto, type LeaveTypeDto } from "./leave-dto";
import { LEAVE_REPOSITORY, type LeaveRepositoryPort, type LeaveRequestWithType } from "./ports/leave-repository.port";

/** Payload of "leave.approved" — attendance marks those days as leave in the same transaction. */
export interface LeaveApprovedEvent {
  companyId: string;
  employeeId: string;
  /** Working days (YYYY-MM-DD) covered by the approved request. */
  dates: string[];
}

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/**
 * Leave requests (docs/domain/business-rules.md "Leave", ADR-0010). Days = working days in the range.
 * Balance-deducting types can't exceed entitlement minus used minus other pending days. The employee's
 * manager (team scope) or HR (company scope) decides; nobody decides their own request. Approval updates
 * the balance and marks attendance days as leave in ONE transaction.
 */
@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    @Inject(LEAVE_REPOSITORY) private readonly repository: LeaveRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: EmployeeScopeService,
    private readonly users: UsersRepository,
    private readonly calendars: CompanyCalendarLoader,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- employee side ----------

  async listTypes(companyId: string): Promise<LeaveTypeDto[]> {
    return (await this.repository.listTypes(companyId, true)).map(toTypeDto);
  }

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  private async activeType(companyId: string, id: string): Promise<LeaveType> {
    const type = await this.repository.findType(companyId, id);
    if (!type || !type.active) throw new NotFoundError("Leave type not found", "leave.type.not_found");
    return type;
  }

  private workingDates(employee: Employee, calendar: CompanyCalendar, start: Date, end: Date): Date[] {
    return workingDaysIn(eachDate(start, end), (d) => calendar.kindOf(employee, d) === "working");
  }

  /** How many days a range would cost and what is left — for the request form, before submitting. */
  async preview(user: AuthenticatedUser, leaveTypeId: string, startIso: string, endIso: string) {
    const me = await this.me(user);
    const type = await this.activeType(user.companyId, leaveTypeId);
    const start = parseDate(startIso);
    const end = parseDate(endIso);
    if (!sameYear(start, end)) throw new BusinessRuleError("leave.cross_year", "A request must stay within one calendar year");
    const calendar = await this.calendars.load(user.companyId);
    const days = this.workingDates(me, calendar, start, end).length;
    const balance = await this.balanceFor(user.companyId, me, type, start.getUTCFullYear());
    return { days, balance };
  }

  async create(user: AuthenticatedUser, input: CreateLeaveRequest, ip: string | null): Promise<LeaveRequestDto> {
    const { companyId } = user;
    const me = await this.me(user);
    if (me.status !== "active") throw new BusinessRuleError("leave.employee_inactive", "Inactive employees cannot request leave");
    const type = await this.activeType(companyId, input.leaveTypeId);
    const start = parseDate(input.startDate);
    const end = parseDate(input.endDate);
    if (!sameYear(start, end)) throw new BusinessRuleError("leave.cross_year", "A request must stay within one calendar year");
    const calendar = await this.calendars.load(companyId);
    const days = this.workingDates(me, calendar, start, end).length;
    if (days === 0) throw new BusinessRuleError("leave.no_working_days", "The range has no working days");
    const year = start.getUTCFullYear();

    const request = await this.db.transaction(companyId, async () => {
      await this.repository.lockEmployee(companyId, me.id);
      if ((await this.repository.findOverlapping(companyId, me.id, start, end)).length > 0) {
        throw new BusinessRuleError("leave.overlap", "Overlaps an existing pending or approved request");
      }
      if (type.deductsBalance) {
        const balance = await this.repository.getOrCreateBalance(companyId, me.id, type.id, year, type.defaultDays ?? 0);
        const pending = await this.repository.sumPendingDays(companyId, me.id, type.id, year);
        const available = availableDays(balance.entitledDays, balance.usedDays, pending);
        if (days > available) {
          throw new BusinessRuleError("leave.insufficient_balance", "Not enough leave balance", { available, requested: days });
        }
      }
      const created = await this.repository.create(companyId, {
        employeeId: me.id,
        leaveTypeId: type.id,
        startDate: start,
        endDate: end,
        days,
        reason: input.reason?.trim() || null,
        createdBy: user.userId,
      });
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "create",
        entity: "leave_requests",
        entityId: created.id,
        after: { employeeId: me.id, leaveType: type.code, startDate: input.startDate, endDate: input.endDate, days },
        ip,
      });
      return created;
    });

    await this.notify({
      companyId,
      userIds: await this.approversFor(companyId, me),
      type: "leave_requested",
      bodyParams: this.params(request, me),
      entity: "leave_requests",
      entityId: request.id,
      link: "/leave?tab=approvals",
    });
    return toRequestDto(request, me);
  }

  async cancel(user: AuthenticatedUser, id: string, ip: string | null): Promise<LeaveRequestDto> {
    const me = await this.me(user);
    const result = await this.db.transaction(user.companyId, async () => {
      const request = await this.repository.lockById(user.companyId, id);
      if (!request || request.employeeId !== me.id) throw new NotFoundError("Leave request not found", "leave.request.not_found");
      if (request.status !== "pending") throw new BusinessRuleError("leave.not_pending", "Only a pending request can be cancelled");
      const cancelled = await this.repository.decide(user.companyId, id, {
        status: "cancelled",
        decidedBy: user.userId,
        decidedAt: this.clock.now(),
        decisionNote: null,
      });
      await this.audit.record(user.companyId, {
        actorId: user.userId,
        action: "cancel",
        entity: "leave_requests",
        entityId: id,
        before: { status: request.status },
        after: { status: "cancelled" },
        ip,
      });
      return cancelled;
    });
    return toRequestDto(result, me);
  }

  async myRequests(user: AuthenticatedUser): Promise<LeaveRequestDto[]> {
    const me = await this.me(user);
    return (await this.repository.list(user.companyId, { employeeIds: [me.id] })).map((r) => toRequestDto(r, me));
  }

  async myBalances(user: AuthenticatedUser, year?: number): Promise<BalanceDto[]> {
    const me = await this.me(user);
    const y = year ?? this.clock.now().getUTCFullYear();
    const types = await this.repository.listTypes(user.companyId, true);
    return Promise.all(types.map((t) => this.balanceFor(user.companyId, me, t, y)));
  }

  private async balanceFor(companyId: string, employee: Employee, type: LeaveType, year: number): Promise<BalanceDto> {
    const pendingDays = await this.repository.sumPendingDays(companyId, employee.id, type.id, year);
    if (!type.deductsBalance) {
      const used = (await this.repository.list(companyId, { employeeIds: [employee.id], status: "approved" }))
        .filter((r) => r.leaveTypeId === type.id && r.startDate.getUTCFullYear() === year)
        .reduce((sum, r) => sum + r.days, 0);
      return { leaveType: toTypeDto(type), year, entitledDays: null, usedDays: used, pendingDays, availableDays: null };
    }
    const balance = await this.repository.findBalance(companyId, employee.id, type.id, year);
    const entitled = balance?.entitledDays ?? type.defaultDays ?? 0;
    const used = balance?.usedDays ?? 0;
    return {
      leaveType: toTypeDto(type),
      year,
      entitledDays: entitled,
      usedDays: used,
      pendingDays,
      availableDays: availableDays(entitled, used, pendingDays),
    };
  }

  // ---------- approver / HR side ----------

  async list(
    user: AuthenticatedUser,
    q: { status?: LeaveRequestWithType["status"]; from?: string; to?: string; employeeId?: string },
  ): Promise<Array<LeaveRequestDto & { canDecide: boolean }>> {
    const visible = (await this.scope.visibleEmployees(user, PERMISSIONS.LEAVE_READ)).filter(
      (e) => !q.employeeId || e.id === q.employeeId,
    );
    if (visible.length === 0) return [];
    const byId = new Map(visible.map((e) => [e.id, e]));
    const deciders = new Set((await this.scope.visibleEmployees(user, PERMISSIONS.LEAVE_APPROVE)).map((e) => e.id));
    const rows = await this.repository.list(user.companyId, {
      employeeIds: [...byId.keys()],
      status: q.status,
      from: q.from ? parseDate(q.from) : undefined,
      to: q.to ? parseDate(q.to) : undefined,
    });
    return rows.map((r) => {
      const employee = byId.get(r.employeeId) as Employee;
      return {
        ...toRequestDto(r, employee),
        canDecide: r.status === "pending" && deciders.has(r.employeeId) && employee.userId !== user.userId,
      };
    });
  }

  async approve(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<LeaveRequestDto> {
    const { companyId } = user;
    const calendar = await this.calendars.load(companyId);
    const { request, employee } = await this.db.transaction(companyId, async () => {
      const { request, employee } = await this.lockForDecision(user, id);
      await this.repository.lockEmployee(companyId, employee.id);
      const year = request.startDate.getUTCFullYear();
      if (request.leaveType.deductsBalance) {
        const balance = await this.repository.getOrCreateBalance(
          companyId,
          employee.id,
          request.leaveTypeId,
          year,
          request.leaveType.defaultDays ?? 0,
        );
        // Other pending requests don't block this one — approval is first come, first served.
        const available = availableDays(balance.entitledDays, balance.usedDays, 0);
        if (request.days > available) {
          throw new BusinessRuleError("leave.insufficient_balance", "Not enough leave balance", { available, requested: request.days });
        }
        await this.repository.addUsedDays(companyId, balance.id, request.days);
      }
      const approved = await this.repository.decide(companyId, id, {
        status: "approved",
        decidedBy: user.userId,
        decidedAt: this.clock.now(),
        decisionNote: note?.trim() || null,
      });
      const dates = this.workingDates(employee, calendar, request.startDate, request.endDate).map(isoDate);
      const handled = await this.events.emitAsync("leave.approved", { companyId, employeeId: employee.id, dates } satisfies LeaveApprovedEvent);
      if (handled.length === 0) throw new Error('No listener handled "leave.approved"');
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "approve",
        entity: "leave_requests",
        entityId: id,
        before: { status: "pending" },
        after: { status: "approved", days: request.days, note: note ?? null },
        ip,
      });
      return { request: approved, employee };
    });
    await this.notifyDecision(companyId, request, employee, "leave_approved");
    return toRequestDto(request, employee);
  }

  async reject(user: AuthenticatedUser, id: string, note: string, ip: string | null): Promise<LeaveRequestDto> {
    const { companyId } = user;
    const { request, employee } = await this.db.transaction(companyId, async () => {
      const { employee } = await this.lockForDecision(user, id);
      const rejected = await this.repository.decide(companyId, id, {
        status: "rejected",
        decidedBy: user.userId,
        decidedAt: this.clock.now(),
        decisionNote: note.trim(),
      });
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "reject",
        entity: "leave_requests",
        entityId: id,
        before: { status: "pending" },
        after: { status: "rejected", note },
        ip,
      });
      return { request: rejected, employee };
    });
    await this.notifyDecision(companyId, request, employee, "leave_rejected");
    return toRequestDto(request, employee);
  }

  private async lockForDecision(user: AuthenticatedUser, id: string): Promise<{ request: LeaveRequestWithType; employee: Employee }> {
    const request = await this.repository.lockById(user.companyId, id);
    if (!request) throw new NotFoundError("Leave request not found", "leave.request.not_found");
    const employee = await this.employees.findById(user.companyId, request.employeeId);
    if (employee.userId === user.userId) throw new ForbiddenError("You cannot decide your own request", "leave.own_request");
    await this.scope.assertCanAccess(user, PERMISSIONS.LEAVE_APPROVE, employee, "leave.out_of_scope");
    if (request.status !== "pending") throw new BusinessRuleError("leave.not_pending", "This request was already decided");
    return { request, employee };
  }

  /** Approved (and pending) leave overlapping a date range, for the team calendar. */
  async calendar(user: AuthenticatedUser, fromIso: string, toIso: string): Promise<LeaveRequestDto[]> {
    const rows = await this.list(user, { from: fromIso, to: toIso });
    return rows.filter((r) => r.status === "approved" || r.status === "pending");
  }

  /** Balances of every visible employee for a year (HR overview). */
  async balances(user: AuthenticatedUser, year?: number) {
    const y = year ?? this.clock.now().getUTCFullYear();
    const visible = (await this.scope.visibleEmployees(user, PERMISSIONS.LEAVE_READ)).filter((e) => e.status === "active");
    const types = (await this.repository.listTypes(user.companyId, true)).filter((t) => t.deductsBalance);
    const rows = [];
    for (const employee of visible) {
      rows.push({
        employee: { id: employee.id, employeeNo: employee.employeeNo, fullNameAr: employee.fullNameAr, fullNameEn: employee.fullNameEn },
        balances: await Promise.all(types.map((t) => this.balanceFor(user.companyId, employee, t, y))),
      });
    }
    return { year: y, rows };
  }

  /** HR-only (company scope): set one employee's yearly entitlement, e.g. 30 days after 5 years. */
  async setEntitlement(user: AuthenticatedUser, input: SetLeaveEntitlement, ip: string | null): Promise<BalanceDto> {
    const { companyId } = user;
    const scope = await this.users.findPermissionScope(companyId, user.userId, PERMISSIONS.LEAVE_APPROVE);
    if (scope !== "company") throw new ForbiddenError("Only HR can change entitlements", "leave.entitlement.forbidden");
    const employee = await this.employees.findById(companyId, input.employeeId);
    if (employee.userId === user.userId) throw new ForbiddenError("You cannot change your own entitlement", "leave.entitlement.own");
    const type = await this.activeType(companyId, input.leaveTypeId);
    if (!type.deductsBalance) throw new BusinessRuleError("leave.entitlement.no_balance", "This leave type has no balance");
    await this.db.transaction(companyId, async () => {
      await this.repository.lockEmployee(companyId, employee.id);
      const balance = await this.repository.getOrCreateBalance(companyId, employee.id, type.id, input.year, type.defaultDays ?? 0);
      const updated = await this.repository.setEntitlement(companyId, balance.id, input.entitledDays);
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: "set_entitlement",
        entity: "leave_balances",
        entityId: balance.id,
        before: { entitledDays: balance.entitledDays },
        after: { entitledDays: updated.entitledDays, reason: input.reason },
        ip,
      });
    });
    return this.balanceFor(companyId, employee, type, input.year);
  }

  // ---------- notifications ----------

  /** The employee's manager (if they have an account), otherwise company-wide approvers. */
  private async approversFor(companyId: string, employee: Employee): Promise<string[]> {
    if (employee.managerId) {
      const manager = await this.employees.findById(companyId, employee.managerId).catch(() => null);
      if (manager?.userId && manager.userId !== employee.userId) return [manager.userId];
    }
    const hr = await this.users.findUserIdsWithScope(companyId, PERMISSIONS.LEAVE_APPROVE, "company");
    return hr.filter((id) => id !== employee.userId);
  }

  private params(request: LeaveRequestWithType, employee: Employee): NotifyUsersEvent["bodyParams"] {
    return {
      employeeNameAr: employee.fullNameAr,
      employeeNameEn: employee.fullNameEn,
      leaveTypeAr: request.leaveType.nameAr,
      leaveTypeEn: request.leaveType.nameEn,
      startDate: isoDate(request.startDate),
      endDate: isoDate(request.endDate),
      days: request.days,
      note: request.decisionNote,
    };
  }

  private async notifyDecision(companyId: string, request: LeaveRequestWithType, employee: Employee, type: string): Promise<void> {
    if (!employee.userId) return;
    await this.notify({
      companyId,
      userIds: [employee.userId],
      type,
      bodyParams: this.params(request, employee),
      entity: "leave_requests",
      entityId: request.id,
      link: "/leave",
    });
  }

  /** The decision is saved and audited — a notification hiccup must not turn it into an error. */
  private async notify(event: NotifyUsersEvent): Promise<void> {
    if (event.userIds.length === 0) return;
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${event.type} ${event.entityId}`, error as Error);
    }
  }
}
