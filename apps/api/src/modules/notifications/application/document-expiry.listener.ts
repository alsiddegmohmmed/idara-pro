import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PERMISSIONS } from "@idara-pro/shared";
import { NotificationsService } from "./notifications.service";

/**
 * The event's shape as this module understands it — deliberately not
 * imported from the employees module (docs/architecture/overview.md:
 * "notifications: consume events from everyone" — a listener depends on the
 * event contract, not on the emitting module's own types, so employees and
 * notifications have zero mutual imports either direction).
 */
interface DocumentExpiryEvent {
  companyId: string;
  documentId: string;
  documentType: string;
  thresholdDays: number;
  daysLeft: number;
  employeeId: string;
  employeeFullNameAr: string;
  employeeFullNameEn: string;
  employeeUserId: string | null;
  employeeBranchId: string | null;
}

@Injectable()
export class DocumentExpiryListener {
  constructor(private readonly notifications: NotificationsService) {}

  // suppressErrors:false on both: the expiry job records its dedup row only after this succeeds,
  // so a swallowed failure would mean the reminder is never retried.
  @OnEvent("document.expiring", { suppressErrors: false })
  async onExpiring(event: DocumentExpiryEvent): Promise<void> {
    await this.notify(event, "document_expiring", "notifications.document_expiring", "notifications.your_document_expiring");
  }

  @OnEvent("document.expired", { suppressErrors: false })
  async onExpired(event: DocumentExpiryEvent): Promise<void> {
    await this.notify(event, "document_expired", "notifications.document_expired", "notifications.your_document_expired");
  }

  private async notify(
    event: DocumentExpiryEvent,
    type: string,
    titleKey: string,
    ownerTitleKey: string,
  ): Promise<void> {
    await this.notifications.notifyRecipients(event.companyId, {
      type,
      entity: "employee_documents",
      entityId: event.documentId,
      bodyParams: {
        documentType: event.documentType,
        thresholdDays: event.thresholdDays,
        daysLeft: event.daysLeft,
        employeeId: event.employeeId,
        employeeFullNameAr: event.employeeFullNameAr,
        employeeFullNameEn: event.employeeFullNameEn,
      },
      // Whoever keeps this employee's file up to date, within their reach — not every directory reader.
      permissionCode: PERMISSIONS.EMPLOYEES_UPDATE,
      target: { employeeId: event.employeeId, branchId: event.employeeBranchId },
      titleKey,
      ownerUserId: event.employeeUserId,
      ownerTitleKey,
    });
  }
}
