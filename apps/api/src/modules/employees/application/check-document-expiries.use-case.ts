import { SYSTEM_JOB_SCOPE } from "../../../shared/access/prisma-scope";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AuditService } from "../../audit";
import { CompaniesService } from "../../company";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { ConfigService } from "../../../shared/config/config.service";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { daysUntilExpiry, EXPIRED_NOTICE_THRESHOLD, selectDueExpiryNotices } from "../domain/employee-rules";
import {
  EMPLOYEE_DOCUMENTS_REPOSITORY,
  type EmployeeDocumentsRepositoryPort,
  type ExpiringDocumentCandidate,
} from "./ports/employee-documents-repository.port";

/** docs/adr/0006-document-expiry-job.md — payload for the "document.expiring"
 * and "document.expired" events; thresholdDays is EXPIRED_NOTICE_THRESHOLD
 * for the latter. NotificationsModule listens for both, with no import
 * back into this module (module-boundary rule — event bus, not direct DI). */
export interface DocumentExpiryEventPayload {
  companyId: string;
  documentId: string;
  documentType: string;
  thresholdDays: number;
  daysLeft: number;
  employeeId: string;
  employeeFullNameAr: string;
  employeeFullNameEn: string;
  employeeUserId: string | null;
  /** Recipients are the people whose reach covers this branch (ADR-0011). */
  employeeBranchId: string | null;
}

@Injectable()
export class CheckDocumentExpiriesUseCase {
  private readonly logger = new Logger(CheckDocumentExpiriesUseCase.name);

  constructor(
    @Inject(EMPLOYEE_DOCUMENTS_REPOSITORY) private readonly documents: EmployeeDocumentsRepositoryPort,
    private readonly companies: CompaniesService,
    private readonly db: TenantDatabase,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  private reminderThresholds(): number[] {
    return this.config.env.DOCUMENT_EXPIRY_REMINDER_DAYS.split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value));
  }

  /** Runs the check for every company, one at a time. A single company's
   * failure is logged and skipped, not thrown — this runs unattended on a
   * schedule, so one bad company must never stop every other company's
   * reminders from being checked. */
  async runForAllCompanies(): Promise<void> {
    const companyIds = await this.db.listCompanyIds();
    for (const companyId of companyIds) {
      try {
        await this.runForCompany(companyId);
      } catch (error) {
        this.logger.error(`Document expiry check failed for company ${companyId}`, error as Error);
      }
    }
  }

  async runForCompany(companyId: string): Promise<{ checked: number; notified: number }> {
    const company = await this.companies.findById(companyId);
    const today = companyDateOnly(this.clock.now(), company.timezone);
    const thresholds = this.reminderThresholds();
    const candidates = await this.documents.listExpiringCandidates(companyId, SYSTEM_JOB_SCOPE);

    let notified = 0;
    for (const candidate of candidates) {
      const daysLeft = daysUntilExpiry(candidate.expiryDate, today);
      const due = selectDueExpiryNotices(daysLeft, thresholds, new Set(candidate.notifiedThresholds));

      for (const thresholdDays of due) {
        try {
          const wasNotified = await this.notifyOne(companyId, candidate, daysLeft, thresholdDays);
          if (wasNotified) notified += 1;
        } catch (error) {
          // One document's failure (a transient DB error, a bug in a future
          // listener) must never suppress every other employee's reminder
          // due the same day in the same company — these are legally
          // relevant (Iqama/passport) expiry notices. Catch-up logic means a
          // skipped notice still fires on the next run.
          this.logger.error(
            `Document expiry notice failed for document ${candidate.id} (threshold ${thresholdDays})`,
            error as Error,
          );
        }
      }
    }
    return { checked: candidates.length, notified };
  }

  private async notifyOne(
    companyId: string,
    candidate: ExpiringDocumentCandidate,
    daysLeft: number,
    thresholdDays: number,
  ): Promise<boolean> {
    const isExpired = thresholdDays === EXPIRED_NOTICE_THRESHOLD;
    const payload: DocumentExpiryEventPayload = {
      companyId,
      documentId: candidate.id,
      documentType: candidate.type,
      thresholdDays,
      daysLeft,
      employeeId: candidate.employee.id,
      employeeFullNameAr: candidate.employee.fullNameAr,
      employeeFullNameEn: candidate.employee.fullNameEn,
      employeeUserId: candidate.employee.userId,
      employeeBranchId: candidate.employee.branchId,
    };

    // emitAsync (not emit) so the dedup row below is only written after
    // NotificationsModule's listener has actually run — see ADR-0006's
    // notify-then-dedup ordering tradeoff.
    await this.events.emitAsync(isExpired ? "document.expired" : "document.expiring", payload);

    // actorId: null is this codebase's existing, unambiguous convention for
    // a system/background actor — every HTTP-triggered audit entry always
    // carries a real authenticated user's id (see with-tenant.ts).
    await this.audit.record(companyId, {
      actorId: null,
      action: isExpired ? "expiry_notice_expired" : "expiry_notice",
      entity: "employee_documents",
      entityId: candidate.id,
      after: { thresholdDays, daysLeft },
      ip: null,
    });

    return this.documents.recordExpiryNotice(companyId, candidate.id, thresholdDays);
  }
}
