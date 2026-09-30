import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  AdjustmentListQuerySchema,
  DecisionNoteSchema,
  PERMISSIONS,
  ProposeAdjustmentSchema,
  type AdjustmentListQuery,
  type AdjustmentView,
  type DecisionNote,
  type ProposeAdjustment,
} from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { AdjustmentsService } from "../application/adjustments.service";

@Controller("api/v1/adjustments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.ADJUSTMENTS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(AdjustmentListQuerySchema)) q: AdjustmentListQuery): Promise<AdjustmentView[]> {
    return this.adjustments.list(user, q);
  }

  @Post()
  @RequirePermission(PERMISSIONS.ADJUSTMENTS_PROPOSE)
  propose(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(ProposeAdjustmentSchema)) body: ProposeAdjustment, @Req() request: FastifyRequest): Promise<AdjustmentView> {
    return this.adjustments.propose(user, body, request.ip);
  }

  @Post(":id/approve")
  @RequirePermission(PERMISSIONS.ADJUSTMENTS_APPROVE)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<AdjustmentView> {
    return this.adjustments.approve(user, id, body.note, request.ip);
  }

  @Post(":id/reject")
  @RequirePermission(PERMISSIONS.ADJUSTMENTS_APPROVE)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<AdjustmentView> {
    return this.adjustments.reject(user, id, body.note, request.ip);
  }
}
