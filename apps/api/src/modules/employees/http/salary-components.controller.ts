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
  CreateSalaryComponentSchema,
  UpdateSalaryComponentSchema,
  PERMISSIONS,
  type CreateSalaryComponent,
  type UpdateSalaryComponent,
} from "@idara-pro/shared";
import type { SalaryComponent } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { SalaryComponentsService } from "../application/salary-components.service";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalaryComponentsController {
  constructor(private readonly salaryComponents: SalaryComponentsService) {}

  @Get("employees/:employeeId/salary-components")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
  ): Promise<SalaryComponent[]> {
    return this.salaryComponents.listByEmployee(user.companyId, employeeId);
  }

  @Post("employees/:employeeId/salary-components")
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Body(new ZodValidationPipe(CreateSalaryComponentSchema)) body: CreateSalaryComponent,
    @Req() request: FastifyRequest,
  ): Promise<SalaryComponent> {
    return this.salaryComponents.create(user.companyId, user.userId, employeeId, body, request.ip);
  }

  @Get("salary-components/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<SalaryComponent> {
    return this.salaryComponents.findById(user.companyId, id);
  }

  @Patch("salary-components/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateSalaryComponentSchema)) body: UpdateSalaryComponent,
    @Req() request: FastifyRequest,
  ): Promise<SalaryComponent> {
    return this.salaryComponents.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete("salary-components/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.salaryComponents.remove(user.companyId, user.userId, id, request.ip);
  }
}
