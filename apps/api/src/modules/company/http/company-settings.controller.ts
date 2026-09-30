import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { PERMISSIONS, UpsertCompanySettingSchema, type UpsertCompanySetting } from "@idara-pro/shared";
import type { CompanySetting } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { CompanySettingsService } from "../application/company-settings.service";

@Controller("api/v1/company-settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.ORG_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<CompanySetting[]> {
    return this.settings.list(user.companyId);
  }

  @Put(":key")
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(UpsertCompanySettingSchema)) body: UpsertCompanySetting,
    @Req() request: FastifyRequest,
  ): Promise<CompanySetting> {
    return this.settings.upsert(user.companyId, user.userId, key, body, request.ip);
  }
}
