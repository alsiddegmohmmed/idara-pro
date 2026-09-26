import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  CreateWorkScheduleSchema,
  UpdateWorkScheduleSchema,
  PERMISSIONS,
  type CreateWorkSchedule,
  type UpdateWorkSchedule,
} from "@idara-pro/shared";
import type { WorkSchedule } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { WorkSchedulesService } from "../application/work-schedules.service";

@Controller("api/v1/work-schedules")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkSchedulesController {
  constructor(private readonly schedules: WorkSchedulesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<WorkSchedule[]> {
    return this.schedules.list(user.companyId);
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<WorkSchedule> {
    return this.schedules.findById(user.companyId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.COMPANY_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateWorkScheduleSchema)) body: CreateWorkSchedule,
    @Req() request: FastifyRequest,
  ): Promise<WorkSchedule> {
    return this.schedules.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.COMPANY_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateWorkScheduleSchema)) body: UpdateWorkSchedule,
    @Req() request: FastifyRequest,
  ): Promise<WorkSchedule> {
    return this.schedules.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.COMPANY_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.schedules.remove(user.companyId, user.userId, id, request.ip);
  }
}
