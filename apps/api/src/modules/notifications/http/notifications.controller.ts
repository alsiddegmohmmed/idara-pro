import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ListNotificationsQuerySchema, PERMISSIONS, type ListNotificationsQuery } from "@idara-pro/shared";
import type { Notification } from "@prisma/client";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { NotificationsService } from "../application/notifications.service";
import type { NotificationPage } from "../application/ports/notifications-repository.port";

@Controller("api/v1/notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Self-scoped by recipientUserId regardless of what @RequirePermission
  // gates — the permission just satisfies AGENTS.md §3 rule 2's "every
  // endpoint declares @RequirePermission," it isn't what does the scoping.
  @Get()
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema)) query: ListNotificationsQuery,
  ): Promise<NotificationPage> {
    return this.notifications.listForUser(user.companyId, user.userId, query.limit, query.cursor);
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_READ)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Notification> {
    return this.notifications.markRead(user.companyId, user.userId, id);
  }
}
