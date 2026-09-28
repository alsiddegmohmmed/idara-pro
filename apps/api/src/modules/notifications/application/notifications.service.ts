import { Inject, Injectable } from "@nestjs/common";
import type { Notification, Prisma } from "@prisma/client";
import { UsersRepository } from "../../auth";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { NotFoundError } from "../../../shared/errors/errors";
import {
  NOTIFICATIONS_REPOSITORY,
  type CreateNotificationData,
  type NotificationPage,
  type NotificationsRepositoryPort,
} from "./ports/notifications-repository.port";

export interface NotifyRecipientsInput {
  type: string;
  entity: string;
  entityId: string;
  bodyParams: Prisma.InputJsonValue;
  /** Every user holding this permission in the company gets titleKey. */
  permissionCode: string;
  titleKey: string;
  /** Optional: also notify this specific user (e.g. the affected employee's
   * own linked account) with a different title — deduped against the
   * permission-based list so nobody gets two rows for one event. */
  ownerUserId?: string | null;
  ownerTitleKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepositoryPort,
    private readonly users: UsersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async notifyRecipients(companyId: string, input: NotifyRecipientsInput): Promise<void> {
    const permissionHolders = await this.users.findByPermission(companyId, input.permissionCode);
    const recipientTitleKeys = new Map<string, string>();
    for (const user of permissionHolders) {
      recipientTitleKeys.set(user.id, input.titleKey);
    }
    if (input.ownerUserId) {
      recipientTitleKeys.set(input.ownerUserId, input.ownerTitleKey ?? input.titleKey);
    }

    const rows: CreateNotificationData[] = [...recipientTitleKeys.entries()].map(([recipientUserId, titleKey]) => ({
      recipientUserId,
      type: input.type,
      titleKey,
      bodyParams: input.bodyParams,
      entity: input.entity,
      entityId: input.entityId,
    }));
    await this.repository.createMany(companyId, rows);
  }

  /** One specific user — no permission fan-out (e.g. telling an employee about a review decision). */
  async notifyUser(
    companyId: string,
    userId: string,
    input: Omit<NotifyRecipientsInput, "permissionCode" | "ownerUserId" | "ownerTitleKey">,
  ): Promise<void> {
    await this.repository.createMany(companyId, [
      {
        recipientUserId: userId,
        type: input.type,
        titleKey: input.titleKey,
        bodyParams: input.bodyParams,
        entity: input.entity,
        entityId: input.entityId,
      },
    ]);
  }

  async listForUser(companyId: string, userId: string, limit: number, cursor?: string): Promise<NotificationPage> {
    return this.repository.listForUser(companyId, userId, limit, cursor);
  }

  async markRead(companyId: string, userId: string, id: string): Promise<Notification> {
    const updated = await this.repository.markRead(companyId, userId, id, this.clock.now());
    if (!updated) throw new NotFoundError("Notification not found", "notifications.not_found");
    return updated;
  }
}
