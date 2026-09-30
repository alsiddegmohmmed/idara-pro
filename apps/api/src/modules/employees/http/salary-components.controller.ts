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
import { EmployeeScopeService } from "../application/employee-scope.service";
import { EmployeesService } from "../application/employees.service";
import { SalaryComponentsService } from "../application/salary-components.service";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalaryComponentsController {
  constructor(
    private readonly salaryComponents: SalaryComponentsService,
    private readonly scope: EmployeeScopeService,
    private readonly employees: EmployeesService,
  ) {}

  /** Compensation tier (ADR-0011 §3): salary:* covering the component's employee. */
  private async component(user: AuthenticatedUser, id: string, permission: string): Promise<SalaryComponent> {
    const component = await this.salaryComponents.findById(user.companyId, id);
    await this.scope.assertEmployee(user, permission, component.employeeId);
    return component;
  }

  @Get("employees/:employeeId/salary-components")
  @RequirePermission(PERMISSIONS.SALARY_READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Req() request: FastifyRequest,
  ): Promise<SalaryComponent[]> {
    const employee = await this.scope.assertEmployee(user, PERMISSIONS.SALARY_READ, employeeId);
    if (employee.userId !== user.userId) {
      await this.employees.recordSensitiveView(user.companyId, user.userId, "salary_components", employeeId, request.ip);
    }
    return this.salaryComponents.listByEmployee(user.companyId, employeeId);
  }

  @Post("employees/:employeeId/salary-components")
  @RequirePermission(PERMISSIONS.SALARY_MANAGE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(CreateSalaryComponentSchema)) body: CreateSalaryComponent,
    @Req() request: FastifyRequest,
  ): Promise<SalaryComponent> {
    await this.scope.assertEmployee(user, PERMISSIONS.SALARY_MANAGE, employeeId);
    return this.salaryComponents.create(user.companyId, user.userId, employeeId, body, request.ip);
  }

  @Get("salary-components/:id")
  @RequirePermission(PERMISSIONS.SALARY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<SalaryComponent> {
    return this.component(user, id, PERMISSIONS.SALARY_READ);
  }

  @Patch("salary-components/:id")
  @RequirePermission(PERMISSIONS.SALARY_MANAGE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSalaryComponentSchema)) body: UpdateSalaryComponent,
    @Req() request: FastifyRequest,
  ): Promise<SalaryComponent> {
    await this.component(user, id, PERMISSIONS.SALARY_MANAGE);
    return this.salaryComponents.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete("salary-components/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.SALARY_MANAGE)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    await this.component(user, id, PERMISSIONS.SALARY_MANAGE);
    return this.salaryComponents.remove(user.companyId, user.userId, id, request.ip);
  }
}
