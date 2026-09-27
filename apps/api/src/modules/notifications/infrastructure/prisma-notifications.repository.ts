import { Injectable } from "@nestjs/common";
import type { Notification } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  CreateNotificationData,
  NotificationPage,
  NotificationsRepositoryPort,
} from "../application/ports/notifications-repository.port";

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async createMany(companyId: string, rows: CreateNotificationData[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.withTenant(companyId, (tx) =>
      tx.notification.createMany({ data: rows.map((row) => ({ companyId, ...row })) }),
    );
  }

  async listForUser(
    companyId: string,
    recipientUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<NotificationPage> {
    return this.db.withTenant(companyId, async (tx) => {
      const items = await tx.notification.findMany({
        where: { companyId, recipientUserId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      const lastItem = page.at(-1);
      return { items: page, nextCursor: hasMore && lastItem ? lastItem.id : null };
    });
  }

  async markRead(companyId: string, recipientUserId: string, id: string, readAt: Date): Promise<Notification | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.notification.updateMany({
        where: { id, companyId, recipientUserId },
        data: { readAt },
      });
      if (count === 0) return null;
      return tx.notification.findFirst({ where: { id, companyId, recipientUserId } });
    });
  }
}
