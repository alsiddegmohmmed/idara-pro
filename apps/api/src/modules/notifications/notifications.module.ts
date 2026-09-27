import { Module } from "@nestjs/common";
import { AuthModule } from "../auth";
import { DocumentExpiryListener } from "./application/document-expiry.listener";
import { NotificationsService } from "./application/notifications.service";
import { NOTIFICATIONS_REPOSITORY } from "./application/ports/notifications-repository.port";
import { PrismaNotificationsRepository } from "./infrastructure/prisma-notifications.repository";
import { NotificationsController } from "./http/notifications.controller";

@Module({
  // AuthModule for UsersRepository.findByPermission — how recipients are
  // derived (docs/adr/0006-document-expiry-job.md), no notification
  // preference/opt-out concept exists yet.
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DocumentExpiryListener,
    { provide: NOTIFICATIONS_REPOSITORY, useClass: PrismaNotificationsRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
