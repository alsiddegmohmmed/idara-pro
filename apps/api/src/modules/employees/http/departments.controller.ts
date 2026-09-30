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
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  PERMISSIONS,
  type CreateDepartment,
  type UpdateDepartment,
} from "@idara-pro/shared";
import type { Department } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { DepartmentsService } from "../application/departments.service";

@Controller("api/v1/departments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<Department[]> {
    return this.departments.list(user.companyId);
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Department> {
    return this.departments.findById(user.companyId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateDepartmentSchema)) body: CreateDepartment,
    @Req() request: FastifyRequest,
  ): Promise<Department> {
    return this.departments.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateDepartmentSchema)) body: UpdateDepartment,
    @Req() request: FastifyRequest,
  ): Promise<Department> {
    return this.departments.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.departments.remove(user.companyId, user.userId, id, request.ip);
  }
}
