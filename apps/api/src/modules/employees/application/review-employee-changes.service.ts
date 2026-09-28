import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Employee, EmployeeDocument } from "@prisma/client";
import { AuditService } from "../../audit";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import {
  EMPLOYEE_DOCUMENTS_REPOSITORY,
  type EmployeeDocumentsRepositoryPort,
  type PendingDocument,
} from "./ports/employee-documents-repository.port";
import { EMPLOYEES_REPOSITORY, type EmployeesRepositoryPort } from "./ports/employees-repository.port";

const last4 = (iban: string | null): string | null => (iban ? iban.slice(-4) : null);

export interface ReviewQueue {
  ibans: Array<{
    employeeId: string;
    employeeNo: string;
    fullNameAr: string;
    fullNameEn: string;
    currentIbanLast4: string | null;
    pendingIban: string;
    submittedAt: Date;
  }>;
  documents: PendingDocument[];
}

/** Payload of "employee.review_decided" — the notifications module listens (no import either way). */
export interface ReviewDecidedEvent {
  companyId: string;
  employeeUserId: string | null;
  kind: "iban" | "document";
  decision: "approved" | "rejected";
  reason: string | null;
  entityId: string;
}

/**
 * HR review of an employee's own IBAN submission / document upload
 * (docs/domain/business-rules.md "Employee onboarding"). A rejection always
 * carries a reason the employee sees; both outcomes are audited and notified.
 */
@Injectable()
export class ReviewEmployeeChangesService {
  private readonly logger = new Logger(ReviewEmployeeChangesService.name);

  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    @Inject(EMPLOYEE_DOCUMENTS_REPOSITORY) private readonly documents: EmployeeDocumentsRepositoryPort,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async queue(companyId: string): Promise<ReviewQueue> {
    const [employees, documents] = await Promise.all([
      this.employees.listPendingIban(companyId),
      this.documents.listPendingReview(companyId),
    ]);
    return {
      ibans: employees.map((e) => ({
        employeeId: e.id,
        employeeNo: e.employeeNo,
        fullNameAr: e.fullNameAr,
        fullNameEn: e.fullNameEn,
        currentIbanLast4: last4(e.iban),
        pendingIban: e.pendingIban ?? "",
        submittedAt: e.updatedAt,
      })),
      documents,
    };
  }

  /** `expectedIban` is what the reviewer actually saw; if the employee has since resubmitted (or
   * someone else already decided), the write below matches nothing and we refuse. */
  private async pendingIbanEmployee(companyId: string, employeeId: string, expectedIban: string): Promise<Employee> {
    const employee = await this.employees.findById(companyId, employeeId);
    if (!employee) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    if (employee.ibanReviewStatus !== "pending_review" || !employee.pendingIban) {
      throw new BusinessRuleError("employees.iban.not_pending", "This employee has no IBAN awaiting review");
    }
    if (employee.pendingIban !== expectedIban) {
      throw new BusinessRuleError("employees.iban.changed", "The submitted IBAN changed since you opened it");
    }
    return employee;
  }

  private staleIbanDecision(): BusinessRuleError {
    return new BusinessRuleError("employees.iban.changed", "The IBAN was changed or already decided; reload the queue");
  }

  async approveIban(
    companyId: string,
    actorId: string,
    employeeId: string,
    expectedIban: string,
    ip: string | null,
  ): Promise<Employee> {
    const before = await this.pendingIbanEmployee(companyId, employeeId, expectedIban);
    const after = await this.employees.decideIban(companyId, employeeId, expectedIban, {
      iban: expectedIban,
      pendingIban: null,
      ibanReviewStatus: null,
      ibanReviewReason: null,
    });
    if (!after) throw this.staleIbanDecision();
    await this.audit.record(companyId, {
      actorId,
      action: "approve_iban",
      entity: "employees",
      entityId: employeeId,
      before: { iban: last4(before.iban), pendingIban: last4(before.pendingIban) },
      after: { iban: last4(after.iban) },
      ip,
    });
    await this.notify({
      companyId, employeeUserId: before.userId, kind: "iban", decision: "approved", reason: null, entityId: employeeId,
    });
    return after;
  }

  async rejectIban(
    companyId: string,
    actorId: string,
    employeeId: string,
    expectedIban: string,
    reason: string,
    ip: string | null,
  ): Promise<Employee> {
    const before = await this.pendingIbanEmployee(companyId, employeeId, expectedIban);
    // The rejected value is dropped; status + reason stay so the employee sees why.
    const after = await this.employees.decideIban(companyId, employeeId, expectedIban, {
      pendingIban: null,
      ibanReviewStatus: "rejected",
      ibanReviewReason: reason,
    });
    if (!after) throw this.staleIbanDecision();
    await this.audit.record(companyId, {
      actorId,
      action: "reject_iban",
      entity: "employees",
      entityId: employeeId,
      before: { iban: last4(before.iban), pendingIban: last4(before.pendingIban) },
      after: { iban: last4(after.iban), reason },
      ip,
    });
    await this.notify({
      companyId, employeeUserId: before.userId, kind: "iban", decision: "rejected", reason, entityId: employeeId,
    });
    return after;
  }

  private async pendingDocument(companyId: string, employeeId: string, id: string): Promise<EmployeeDocument> {
    const document = await this.documents.findById(companyId, id);
    if (!document || document.employeeId !== employeeId) {
      throw new NotFoundError("Document not found", "employees.document.not_found");
    }
    if (document.reviewStatus !== "pending_review") {
      throw new BusinessRuleError("employees.document.not_pending", "This document is not awaiting review");
    }
    return document;
  }

  private async decideDocument(
    companyId: string,
    actorId: string,
    employeeId: string,
    id: string,
    decision: "approved" | "rejected",
    reason: string | null,
    ip: string | null,
  ): Promise<EmployeeDocument> {
    const before = await this.pendingDocument(companyId, employeeId, id);
    const after = await this.documents.setReviewStatus(companyId, id, decision, reason);
    if (!after) throw new BusinessRuleError("employees.document.not_pending", "This document is not awaiting review");
    await this.audit.record(companyId, {
      actorId,
      action: decision === "approved" ? "approve_document" : "reject_document",
      entity: "employee_documents",
      entityId: id,
      before: { reviewStatus: before.reviewStatus },
      after: { reviewStatus: after.reviewStatus, reason },
      ip,
    });
    const employee = await this.employees.findById(companyId, employeeId);
    await this.notify({
      companyId, employeeUserId: employee?.userId ?? null, kind: "document", decision, reason, entityId: id,
    });
    return after;
  }

  approveDocument(companyId: string, actorId: string, employeeId: string, id: string, ip: string | null) {
    return this.decideDocument(companyId, actorId, employeeId, id, "approved", null, ip);
  }

  rejectDocument(companyId: string, actorId: string, employeeId: string, id: string, reason: string, ip: string | null) {
    return this.decideDocument(companyId, actorId, employeeId, id, "rejected", reason, ip);
  }

  /** The decision is already saved and audited — a notification hiccup must not turn it into a 500. */
  private async notify(event: ReviewDecidedEvent): Promise<void> {
    try {
      await this.events.emitAsync("employee.review_decided", event);
    } catch (error) {
      this.logger.error(`Review notification failed for ${event.kind} ${event.entityId}`, error as Error);
    }
  }
}
