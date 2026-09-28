import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { ForbiddenError } from "../../../shared/errors/errors";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeesService } from "../application/employees.service";
import { InviteEmployeeUseCase } from "../application/invite-employee.use-case";
import { toEmployeeView } from "./employee-view";

const canSeeFullIban = (user: AuthenticatedUser): boolean => user.permissions.includes(PERMISSIONS.EMPLOYEES_REVIEW);

/** The IBAN is the payroll destination: setting it directly is a reviewer-level act, enforced here, not just hidden in the form. */
function assertMayWriteIban(user: AuthenticatedUser, body: { iban?: string | null }): void {
  if (body.iban !== undefined && !canSeeFullIban(user)) {
    throw new ForbiddenError("Setting an IBAN requires the review permission", "employees.iban.review_permission_required");
  }
}

@Controller("api/v1/employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly inviteEmployee: InviteEmployeeUseCase,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Employee[]> {
    const employees = await this.employees.list(user.companyId);
    return employees.map((e) => toEmployeeView(e, canSeeFullIban(user)));
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<Employee> {
    return toEmployeeView(await this.employees.findById(user.companyId, id), canSeeFullIban(user));
  }

  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) body: CreateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    assertMayWriteIban(user, body);
    return toEmployeeView(await this.employees.create(user.companyId, user.userId, body, request.ip), canSeeFullIban(user));
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) body: UpdateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee & { accessRestored: boolean | null }> {
    assertMayWriteIban(user, body);
    const { employee, accessRestored } = await this.employees.update(user.companyId, user.userId, id, body, request.ip, {
      canManageAccess: user.permissions.includes(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS),
    });
    // accessRestored: null = not a re-activation; false = re-activated but the login was NOT restored.
    return { ...toEmployeeView(employee, canSeeFullIban(user)), accessRestored };
  }

  /** Re-enables a deactivated employee's login: new password by email, old one destroyed, sessions gone. */
  @Post(":id/restore-access")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS)
  restoreAccess(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.employees.restoreAccess(user.companyId, user.userId, id, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.employees.remove(user.companyId, user.userId, id, request.ip);
  }

  @Post(":id/invite")
  @RequirePermission(PERMISSIONS.EMPLOYEES_INVITE)
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
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
