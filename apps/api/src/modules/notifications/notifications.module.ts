import { Module } from "@nestjs/common";
import { AuthModule } from "../auth";
import { DocumentExpiryListener } from "./application/document-expiry.listener";
import { ReviewDecidedListener } from "./application/review-decided.listener";
import { NotifyUsersListener } from "./application/notify-users.listener";
import { EmailQueueModule } from "../../shared/mail/email-queue.module";
import { NotificationsService } from "./application/notifications.service";
import { NOTIFICATIONS_REPOSITORY } from "./application/ports/notifications-repository.port";
import { PrismaNotificationsRepository } from "./infrastructure/prisma-notifications.repository";
import { NotificationsController } from "./http/notifications.controller";

@Module({
  // AuthModule for UsersRepository (email addresses). Recipients by permission + reach come from
  // AccessPolicy (global); no notification preference/opt-out concept exists yet.
  // EmailQueueModule: approval/attendance emails (enqueue only; the worker sends).
  imports: [AuthModule, EmailQueueModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DocumentExpiryListener,
    ReviewDecidedListener,
    NotifyUsersListener,
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PrismaNotificationsRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
