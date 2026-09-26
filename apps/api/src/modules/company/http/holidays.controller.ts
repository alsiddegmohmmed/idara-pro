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
  CreateHolidaySchema,
  UpdateHolidaySchema,
  PERMISSIONS,
  type CreateHoliday,
  type UpdateHoliday,
} from "@idara-pro/shared";
import type { Holiday } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { HolidaysService } from "../application/holidays.service";

@Controller("api/v1/holidays")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<Holiday[]> {
    return this.holidays.list(user.companyId);
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Holiday> {
    return this.holidays.findById(user.companyId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.COMPANY_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateHolidaySchema)) body: CreateHoliday,
    @Req() request: FastifyRequest,
  ): Promise<Holiday> {
    return this.holidays.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.COMPANY_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateHolidaySchema)) body: UpdateHoliday,
    @Req() request: FastifyRequest,
  ): Promise<Holiday> {
    return this.holidays.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.COMPANY_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.holidays.remove(user.companyId, user.userId, id, request.ip);
  }
}
