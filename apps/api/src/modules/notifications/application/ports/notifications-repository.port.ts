import type { Notification, Prisma } from "@prisma/client";

export const NOTIFICATIONS_REPOSITORY = Symbol("NOTIFICATIONS_REPOSITORY");

export interface CreateNotificationData {
  recipientUserId: string;
  type: string;
  titleKey: string;
  bodyParams: Prisma.InputJsonValue;
  entity: string;
  entityId: string;
}

export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
}

export interface NotificationsRepositoryPort {
  createMany(companyId: string, rows: CreateNotificationData[]): Promise<void>;
  /** Self-scoped by recipientUserId — never any other user's notifications. */
  listForUser(companyId: string, recipientUserId: string, limit: number, cursor?: string): Promise<NotificationPage>;
  /** Returns null if the notification doesn't exist or isn't this user's.
   * readAt comes from the caller's Clock (AGENTS.md §3 rule 4), matching
   * UsersRepository.updateLastLogin's existing "at" parameter convention. */
  markRead(companyId: string, recipientUserId: string, id: string, readAt: Date): Promise<Notification | null>;
}
