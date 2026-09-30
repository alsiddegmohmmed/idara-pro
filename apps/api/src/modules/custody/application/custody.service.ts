import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PERMISSIONS, type CreateCustodyRequest, type CustodyStatus } from "@idara-pro/shared";
import type { CustodyRequest, Employee } from "@prisma/client";
import { AuditService } from "../../audit";
import { EmployeeScopeService, EmployeesService } from "../../employees";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { canTransition, settlementError } from "../domain/custody-rules";
import { CUSTODY_REPOSITORY, type CustodyRepositoryPort } from "./ports/custody-repository.port";

export interface CustodyDto {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  amountHalalas: string;
  purpose: string;
  status: CustodyStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  paidAt: string | null;
  technoLinkRef: string | null;
  settledAt: string | null;
  settledAmountHalalas: string | null;
  settlementNote: string | null;
  createdAt: string;
}

export interface CustodyListItem extends CustodyDto {
  /** Actions this viewer may take right now (UI hint; the server re-checks each one). */
  actions: Array<"approve" | "reject" | "pay" | "settle">;
}

const toDto = (c: CustodyRequest, e: Employee | null): CustodyDto => ({
  id: c.id,
  employee: e ? { id: e.id, employeeNo: e.employeeNo, fullNameAr: e.fullNameAr, fullNameEn: e.fullNameEn } : null,
  amountHalalas: c.amountHalalas.toString(),
  purpose: c.purpose,
  status: c.status,
  decidedAt: c.decidedAt?.toISOString() ?? null,
  decisionNote: c.decisionNote,
  paidAt: c.paidAt?.toISOString() ?? null,
  technoLinkRef: c.technoLinkRef,
  settledAt: c.settledAt?.toISOString() ?? null,
  settledAmountHalalas: c.settledAmountHalalas?.toString() ?? null,
  settlementNote: c.settlementNote,
  createdAt: c.createdAt.toISOString(),
});

type Step = "approve" | "reject" | "pay" | "settle";
const STEP: Record<Step, { to: CustodyStatus; permission: string }> = {
  approve: { to: "approved", permission: PERMISSIONS.CUSTODY_APPROVE },
  reject: { to: "rejected", permission: PERMISSIONS.CUSTODY_APPROVE },
  pay: { to: "paid", permission: PERMISSIONS.CUSTODY_PAY },
  settle: { to: "settled", permission: PERMISSIONS.CUSTODY_SETTLE },
};

/**
 * Custody (عهدة) workflow, status only (business-rules.md "Custody"). Every step is scope-checked and
 * audited, and nobody acts on their own request. "Paid" needs the Techno Link reference — the money
 * itself is paid and booked in Techno Link, never here.
 */
@Injectable()
export class CustodyService {
  private readonly logger = new Logger(CustodyService.name);

  constructor(
    @Inject(CUSTODY_REPOSITORY) private readonly repository: CustodyRepositoryPort,
    private readonly employees: EmployeesService,
    private readonly scope: EmployeeScopeService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async me(user: AuthenticatedUser): Promise<Employee> {
    const me = await this.employees.findByUserId(user.companyId, user.userId);
    if (!me) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return me;
  }

  async create(user: AuthenticatedUser, input: CreateCustodyRequest, ip: string | null): Promise<CustodyDto> {
    const me = await this.me(user);
    if (me.status !== "active") throw new BusinessRuleError("custody.employee_inactive", "Inactive employees cannot request custody");
    const created = await this.db.transaction(user.companyId, async () => {
      const row = await this.repository.create(user.companyId, {
        employeeId: me.id,
        // Snapshot (ADR-0012): the request stays with this branch even if the employee transfers.
        branchId: me.branchId,
        amountHalalas: BigInt(input.amountHalalas),
        purpose: input.purpose.trim(),
        createdBy: user.userId,
      });
      await this.audit.record(user.companyId, {
        actorId: user.userId,
        action: "create",
        entity: "custody_requests",
        entityId: row.id,
        after: { employeeId: me.id, amountHalalas: input.amountHalalas, purpose: row.purpose },
        ip,
      });
      return row;
    });
    // The request is saved: a failed recipient lookup is logged, never turned into an error (a retry would duplicate).
    const approvers = await this.approversFor(user.companyId, me, created.branchId).catch((error: unknown) => {
      this.logger.error(`Could not resolve approvers for custody request ${created.id}`, error as Error);
      return [];
    });
    await this.notify(user.companyId, approvers, "custody_requested", created, me, "/custody?tab=manage");
    return toDto(created, me);
  }

  async myRequests(user: AuthenticatedUser): Promise<CustodyDto[]> {
    const me = await this.me(user);
    return (await this.repository.list(user.companyId, { employeeIds: [me.id] })).map((c) => toDto(c, me));
  }

  async cancel(user: AuthenticatedUser, id: string, ip: string | null): Promise<CustodyDto> {
    const me = await this.me(user);
    const row = await this.db.transaction(user.companyId, async () => {
      const current = await this.repository.lockById(user.companyId, id);
      if (!current || current.employeeId !== me.id) throw new NotFoundError("Custody request not found", "custody.not_found");
      if (!canTransition(current.status, "cancelled")) throw new BusinessRuleError("custody.invalid_transition", "Only a pending request can be cancelled");
      const updated = await this.repository.update(user.companyId, id, { status: "cancelled" });
      await this.audit.record(user.companyId, {
        actorId: user.userId,
        action: "cancel",
        entity: "custody_requests",
        entityId: id,
        before: { status: current.status },
        after: { status: "cancelled" },
        ip,
      });
      return updated;
    });
    return toDto(row, me);
  }

  /** Requests of employees the viewer may read, with the actions they may take on each. */
  async list(user: AuthenticatedUser, filter: { status?: CustodyStatus; employeeId?: string }): Promise<CustodyListItem[]> {
    const readScope = this.scope.scope(user, PERMISSIONS.CUSTODY_READ);
    if (!readScope) return [];
    // Scoped by each request's own branch (ADR-0012), not the employee's current one.
    const rows = await this.repository.list(user.companyId, {
      scope: readScope,
      employeeIds: filter.employeeId ? [filter.employeeId] : undefined,
      status: filter.status,
    });
    const employees = await this.employees.byIdsForRecords(user.companyId, rows.map((c) => c.employeeId));
    return rows.map((c) => {
      const employee = employees.get(c.employeeId) ?? null;
      const own = employee?.userId === user.userId;
      const target = { employeeId: c.employeeId, branchId: c.branchId };
      const actions = (Object.keys(STEP) as Step[]).filter(
        (step) => !own && this.scope.covers(user, STEP[step].permission, target) && canTransition(c.status, STEP[step].to),
      );
      return { ...toDto(c, employee), actions };
    });
  }

  async approve(user: AuthenticatedUser, id: string, note: string | undefined, ip: string | null): Promise<CustodyDto> {
    return this.step(user, id, "approve", ip, () => ({ decidedBy: user.userId, decidedAt: this.clock.now(), decisionNote: note?.trim() || null }));
  }

  async reject(user: AuthenticatedUser, id: string, note: string, ip: string | null): Promise<CustodyDto> {
    return this.step(user, id, "reject", ip, () => ({ decidedBy: user.userId, decidedAt: this.clock.now(), decisionNote: note.trim() }));
  }

  async pay(user: AuthenticatedUser, id: string, technoLinkRef: string, ip: string | null): Promise<CustodyDto> {
    return this.step(user, id, "pay", ip, () => ({ paidBy: user.userId, paidAt: this.clock.now(), technoLinkRef: technoLinkRef.trim() }));
  }

  async settle(user: AuthenticatedUser, id: string, settledAmountHalalas: string, note: string | undefined, ip: string | null): Promise<CustodyDto> {
    return this.step(user, id, "settle", ip, (current) => {
      const settled = BigInt(settledAmountHalalas);
      if (settlementError(current.amountHalalas, settled)) {
        throw new BusinessRuleError("custody.settlement_exceeds_paid", "The settled amount cannot exceed the paid amount");
      }
      return { settledBy: user.userId, settledAt: this.clock.now(), settledAmountHalalas: settled, settlementNote: note?.trim() || null };
    });
  }

  private async step(
    user: AuthenticatedUser,
    id: string,
    step: Step,
    ip: string | null,
    fields: (current: CustodyRequest) => Record<string, unknown>,
  ): Promise<CustodyDto> {
    const { companyId } = user;
    const { row, employee } = await this.db.transaction(companyId, async () => {
      const current = await this.repository.lockById(companyId, id);
      if (!current) throw new NotFoundError("Custody request not found", "custody.not_found");
      const employee = await this.employees.findById(companyId, current.employeeId);
      if (employee.userId === user.userId) throw new ForbiddenError("You cannot act on your own custody request", "custody.own_request");
      this.scope.assertCanAccess(user, STEP[step].permission, { employeeId: employee.id, branchId: current.branchId }, "custody.out_of_scope");
      if (!canTransition(current.status, STEP[step].to)) {
        throw new BusinessRuleError("custody.invalid_transition", `Cannot ${step} a request that is ${current.status}`);
      }
      const extra = fields(current);
      const updated = await this.repository.update(companyId, id, { status: STEP[step].to, ...extra });
      await this.audit.record(companyId, {
        actorId: user.userId,
        action: step,
        entity: "custody_requests",
        entityId: id,
        before: { status: current.status },
        after: JSON.parse(JSON.stringify({ status: updated.status, ...extra }, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
        ip,
      });
      return { row: updated, employee };
    });

    if (employee.userId) {
      await this.notify(companyId, [employee.userId], `custody_${STEP[step].to}`, row, employee, "/custody");
    }
    if (step === "approve") {
      // The accountant is next: pay it and record it in Techno Link.
      const payers = await this.scope.eligibleUsers(companyId, PERMISSIONS.CUSTODY_PAY, { employeeId: employee.id, branchId: row.branchId }, employee.userId).catch((error: unknown) => {
        this.logger.error(`Could not resolve payers for custody request ${row.id}`, error as Error);
        return [];
      });
      await this.notify(companyId, payers, "custody_to_pay", row, employee, "/custody?tab=manage");
    }
    return toDto(row, employee);
  }

  /** Everyone who may approve for this employee (ADR-0011 §6.3); first decision wins. */
  private approversFor(companyId: string, employee: Employee, branchId: string | null): Promise<string[]> {
    return this.scope.eligibleUsers(companyId, PERMISSIONS.CUSTODY_APPROVE, { employeeId: employee.id, branchId }, employee.userId);
  }

  private async notify(companyId: string, userIds: string[], type: string, c: CustodyRequest, e: Employee, link: string): Promise<void> {
    if (userIds.length === 0) return;
    const event: NotifyUsersEvent = {
      companyId,
      userIds,
      type,
      bodyParams: {
        employeeNameAr: e.fullNameAr,
        employeeNameEn: e.fullNameEn,
        amountHalalas: c.amountHalalas.toString(),
        purpose: c.purpose,
        note: c.decisionNote,
        technoLinkRef: c.technoLinkRef,
      },
      entity: "custody_requests",
      entityId: c.id,
      link,
    };
    try {
      await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
    } catch (error) {
      this.logger.error(`Notification failed for ${type} ${c.id}`, error as Error);
    }
  }

  /** Paid custody in a date range (by payment date, Asia/Riyadh days) for the Techno Link export. */
  async paidBetween(user: AuthenticatedUser, fromIso: string, toIso: string) {
    const from = new Date(`${fromIso}T00:00:00+03:00`);
    const to = new Date(new Date(`${toIso}T00:00:00+03:00`).getTime() + 86_400_000);
    // Only requests the exporter may read (a branch accountant exports their branches' requests).
    const rows = (await this.repository.listPaidBetween(user.companyId, from, to)).filter((c) =>
      this.scope.covers(user, PERMISSIONS.CUSTODY_READ, { employeeId: c.employeeId, branchId: c.branchId }),
    );
    const employees = await this.employees.byIdsForRecords(user.companyId, rows.map((c) => c.employeeId));
    return rows.map((c) => toDto(c, employees.get(c.employeeId) ?? null));
  }
}
