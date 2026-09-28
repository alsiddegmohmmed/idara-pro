import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationsService } from "./notifications.service";

/** Event shape as this module understands it — deliberately not imported from
 * employees (same zero-import rule as DocumentExpiryListener). */
interface ReviewDecidedEvent {
  companyId: string;
  employeeUserId: string | null;
  kind: "iban" | "document";
  decision: "approved" | "rejected";
  reason: string | null;
  entityId: string;
}

/** Tells the employee about HR's decision on their IBAN / document — both outcomes. */
@Injectable()
export class ReviewDecidedListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent("employee.review_decided")
  async onReviewDecided(event: ReviewDecidedEvent): Promise<void> {
    if (!event.employeeUserId) return; // employee has no account (yet) — nobody to tell
    await this.notifications.notifyUser(event.companyId, event.employeeUserId, {
      type: `${event.kind}_${event.decision}`,
      titleKey: `notifications.${event.kind}_${event.decision}`,
      bodyParams: { decision: event.decision, reason: event.reason, kind: event.kind },
      entity: event.kind === "iban" ? "employees" : "employee_documents",
      entityId: event.entityId,
    });
  }
}
