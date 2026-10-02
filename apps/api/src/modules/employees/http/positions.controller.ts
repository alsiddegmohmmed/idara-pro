import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { CreatePositionSchema, PERMISSIONS, UpdatePositionSchema, type CreatePosition, type PositionView, type UpdatePosition } from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { PositionsService } from "../application/positions.service";

/** المسميات الوظيفية: read with the directory, managed with company setup (like departments). */
@Controller("api/v1/positions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<PositionView[]> {
    return this.positions.list(user.companyId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(CreatePositionSchema)) body: CreatePosition, @Req() request: FastifyRequest): Promise<PositionView> {
    return this.positions.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePositionSchema)) body: UpdatePosition,
    @Req() request: FastifyRequest,
  ): Promise<PositionView> {
    return this.positions.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.positions.remove(user.companyId, user.userId, id, request.ip);
  }
}
