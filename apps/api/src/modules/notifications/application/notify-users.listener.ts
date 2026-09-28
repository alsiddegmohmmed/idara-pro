import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { UsersRepository } from "../../auth";
import { ConfigService } from "../../../shared/config/config.service";
import { NOTIFY_USERS_EVENT, type NotifyUsersEvent } from "../../../shared/events/notify-users.event";
import { EmailQueueService } from "../../../shared/mail/email-queue.service";
import { renderNotificationEmail } from "../../../shared/mail/templates/notification-email";
import { NotificationsService } from "./notifications.service";

/**
 * In-app + email for approvals and attendance (Phase 3 "Notifications"). One in-app row per
 * recipient (rendered by the web app in the viewer's language) and, where a template exists, one
 * bilingual email to each active recipient's login email.
 */
@Injectable()
export class NotifyUsersListener {
  private readonly logger = new Logger(NotifyUsersListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UsersRepository,
    private readonly email: EmailQueueService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(NOTIFY_USERS_EVENT)
  async onNotify(event: NotifyUsersEvent): Promise<void> {
    const recipients = [...new Set(event.userIds)];
    for (const userId of recipients) {
      await this.notifications.notifyUser(event.companyId, userId, {
        type: event.type,
        titleKey: `notifications.${event.type}`,
        bodyParams: event.bodyParams,
        entity: event.entity,
        entityId: event.entityId,
      });
      const message = renderNotificationEmail(event.type, event.bodyParams, `${this.config.env.WEB_APP_URL}${event.link}`);
      if (!message) continue;
      try {
        const user = await this.users.findById(event.companyId, userId);
        if (user?.status === "active") await this.email.enqueue({ to: user.email, ...message });
      } catch (error) {
        // The in-app notification is saved; a mail queue hiccup must not undo it.
        this.logger.error(`Email for ${event.type} ${event.entityId} failed`, error as Error);
      }
    }
  }
}
