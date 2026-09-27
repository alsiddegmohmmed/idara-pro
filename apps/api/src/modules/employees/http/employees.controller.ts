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
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  InviteEmployeeSchema,
  PERMISSIONS,
  type CreateEmployee,
  type UpdateEmployee,
  type InviteEmployee,
} from "@idara-pro/shared";
import type { Employee, Invitation } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeesService } from "../application/employees.service";
import { InviteEmployeeUseCase } from "../application/invite-employee.use-case";

@Controller("api/v1/employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly inviteEmployee: InviteEmployeeUseCase,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<Employee[]> {
    return this.employees.list(user.companyId);
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Employee> {
    return this.employees.findById(user.companyId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) body: CreateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.employees.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) body: UpdateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.employees.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.employees.remove(user.companyId, user.userId, id, request.ip);
  }

  @Post(":id/invite")
  @RequirePermission(PERMISSIONS.EMPLOYEES_INVITE)
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(InviteEmployeeSchema)) body: InviteEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Omit<Invitation, "tokenHash">> {
    const invitation = await this.inviteEmployee.execute(user.companyId, user.userId, id, body.email, request.ip);
    // Never return the token hash — no endpoint needs it, and there's no
    // reason to expose it even though it's a one-way HMAC, not the token itself.
    return {
      id: invitation.id,
      companyId: invitation.companyId,
      employeeId: invitation.employeeId,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdBy: invitation.createdBy,
      createdAt: invitation.createdAt,
    };
  }
}
