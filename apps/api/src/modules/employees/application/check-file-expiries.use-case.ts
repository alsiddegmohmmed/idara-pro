import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { COMPANY_SETTING_KEYS, PERMISSIONS } from "@idara-pro/shared";
import { CompanySettingsService } from "../../company";
import { AccessPolicy } from "../../../shared/access/access-policy.service";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import { daysUntilExpiry, selectDueExpiryNotices } from "../domain/employee-rules";
import { EMPLOYEE_FILE_REPOSITORY, type EmployeeFileRepositoryPort, type ExpiryCandidate, type ExpiryKind } from "./ports/employee-file-repository.port";
import { EMPLOYEES_REPOSITORY, type EmployeesRepositoryPort } from "./ports/employees-repository.port";

export const DEFAULT_ALERT_DAYS_BEFORE = 30;
/** How far back an already-passed date still gets its one-time "passed" notice. */
const LOOKBACK_DAYS = 30;

/** Who keeps each kind of record up to date — they are told, within their reach. */
const MAINTAINER: Record<ExpiryKind, string> = {
  contract_end: PERMISSIONS.CONTRACTS_MANAGE,
  probation_end: PERMISSIONS.CONTRACTS_MANAGE,
  insurance_end: PERMISSIONS.INSURANCE_MANAGE,
};

/**
 * Alerts v1 (Phase 5): contract ends, probation ends and insurance ends, announced N days before (company
 * setting, default 30) and again 7 days before, plus once when the date has passed. Recipients: whoever may
 * manage that record for the employee's branch; for probation also the employee's direct manager.
 * Each (record, threshold) is announced once, even across restarts (alert_notices).
 */
@Injectable()
export class CheckFileExpiriesUseCase {
  private readonly logger = new Logger(CheckFileExpiriesUseCase.name);

  constructor(
    @Inject(EMPLOYEE_FILE_REPOSITORY) private readonly file: EmployeeFileRepositoryPort,
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    private readonly settings: CompanySettingsService,
    private readonly policy: AccessPolicy,
    private readonly events: EventEmitter2,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async runForAllCompanies(): Promise<void> {
    for (const companyId of await this.db.listCompanyIds()) {
      try {
        const n = await this.runForCompany(companyId);
        if (n > 0) this.logger.log(`Sent ${n} contract/probation/insurance reminders (company ${companyId})`);
      } catch (error) {
        this.logger.error(`File expiry check failed for company ${companyId}`, error as Error);
      }
    }
  }

  async runForCompany(companyId: string): Promise<number> {
    const today = companyDateOnly(this.clock.now());
    const daysBefore = await this.settings.getNumber(companyId, COMPANY_SETTING_KEYS.ALERT_DAYS_BEFORE, today, DEFAULT_ALERT_DAYS_BEFORE);
    const thresholds = [...new Set([Math.round(daysBefore), 7])].filter((d) => d >= 0);
    const until = new Date(today.getTime() + Math.max(...thresholds) * 86_400_000);
    const since = new Date(today.getTime() - LOOKBACK_DAYS * 86_400_000);
    const candidates = await this.file.expiryCandidates(companyId, since, until);

    let sent = 0;
    for (const kind of Object.keys(MAINTAINER) as ExpiryKind[]) {
      const ofKind = candidates.filter((c) => c.kind === kind);
      const notified = await this.file.notifiedThresholds(companyId, kind, ofKind.map((c) => c.entityId));
      for (const candidate of ofKind) {
        const daysLeft = daysUntilExpiry(candidate.date, today);
        const due = selectDueExpiryNotices(daysLeft, thresholds, notified.get(candidate.entityId) ?? new Set());
        if (due.length === 0) continue;
        // Several thresholds missed at once (job was down): one message, all of them recorded.
        await this.notify(companyId, candidate, daysLeft);
        await this.file.recordNotices(companyId, due.map((thresholdDays) => ({ kind, entityId: candidate.entityId, thresholdDays })));
        sent += 1;
      }
    }
    return sent;
  }

  private async notify(companyId: string, c: ExpiryCandidate, daysLeft: number): Promise<void> {
    const recipients = new Set(
      await this.policy.usersWhoCan(companyId, MAINTAINER[c.kind], { employeeId: c.employee.id, branchId: c.employee.branchId }),
    );
    if (c.kind === "probation_end" && c.employee.managerId) {
      const manager = await this.employees.findById(companyId, c.employee.managerId);
      if (manager?.userId) recipients.add(manager.userId);
    }
    if (c.employee.userId) recipients.delete(c.employee.userId);
    if (recipients.size === 0) return;
    const event: NotifyUsersEvent = {
      companyId,
      userIds: [...recipients],
      type: daysLeft < 0 ? `${c.kind}_passed` : `${c.kind}_soon`,
      bodyParams: {
        employeeNameAr: c.employee.fullNameAr,
        employeeNameEn: c.employee.fullNameEn,
        date: c.date.toISOString().slice(0, 10),
        daysLeft,
      },
      entity: "employees",
      entityId: c.employee.id,
      link: `/employees/${c.employee.id}?tab=${c.kind === "insurance_end" ? "insurance" : "contracts"}`,
    };
    await this.events.emitAsync(NOTIFY_USERS_EVENT, event);
  }
}
