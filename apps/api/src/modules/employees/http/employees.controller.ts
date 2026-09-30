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
  type AssignmentView,
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
import { EmployeeAssignmentsService } from "../application/employee-assignments.service";
import { EmployeeScopeService } from "../application/employee-scope.service";
import { EmployeesService } from "../application/employees.service";
import { InviteEmployeeUseCase } from "../application/invite-employee.use-case";
import { toEmployeeView } from "./employee-view";

/** Body fields in the personal tier: only employees:read-sensitive holders may write them (ADR-0011 §3). */
const PERSONAL_FIELDS = ["nationalId", "birthDate", "maritalStatus", "phone", "additionalPhone", "personalEmail"] as const;
const touchesPersonal = (body: Partial<Record<(typeof PERSONAL_FIELDS)[number], unknown>>): boolean =>
  PERSONAL_FIELDS.some((f) => body[f] !== undefined);

/** The IBAN is the payroll destination: setting it directly is a reviewer-level act, enforced here, not just hidden in the form. */
function assertMayWriteIban(scope: EmployeeScopeService, user: AuthenticatedUser, body: { iban?: string | null }, target: { id: string; branchId: string | null }): void {
  if (body.iban !== undefined && !scope.covers(user, PERMISSIONS.EMPLOYEES_REVIEW, target)) {
    throw new ForbiddenError("Setting an IBAN requires the review permission", "employees.iban.review_permission_required");
  }
}

@Controller("api/v1/employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly inviteEmployee: InviteEmployeeUseCase,
    private readonly scope: EmployeeScopeService,
    private readonly assignments: EmployeeAssignmentsService,
  ) {}

  private view(user: AuthenticatedUser, employee: Employee): Employee {
    const sensitive = employee.userId === user.userId || this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employee);
    return toEmployeeView(employee, sensitive);
  }

  /** Branch-reach writers (Branch HR) may only place employees in branches they reach. */
  private assertBranchInReach(user: AuthenticatedUser, permission: string, branchId: string | null | undefined, employeeId: string): void {
    if (branchId === undefined) return;
    this.scope.assertCanAccess(user, permission, { employeeId, branchId }, "employees.branch_out_of_scope");
  }

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Employee[]> {
    return (await this.scope.visibleEmployees(user, PERMISSIONS.EMPLOYEES_READ)).map((e) => this.view(user, e));
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<Employee> {
    const employee = await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ, id);
    if (employee.userId !== user.userId && this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employee)) {
      await this.employees.recordSensitiveView(user.companyId, user.userId, "employees", id, request.ip);
    }
    return this.view(user, employee);
  }

  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) body: CreateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    // A new record has no id yet: judge it by the branch it is being created in.
    this.assertBranchInReach(user, PERMISSIONS.EMPLOYEES_CREATE, body.branchId ?? null, "new");
    assertMayWriteIban(this.scope, user, body, { id: "new", branchId: body.branchId ?? null });
    // The national ID is always required on create; the other personal fields need the permission.
    const { nationalId: _required, ...rest } = body;
    void _required;
    if (touchesPersonal(rest) && !this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, { employeeId: "new", branchId: body.branchId ?? null })) {
      throw new ForbiddenError("Personal data requires the personal-data permission", "employees.sensitive_permission_required");
    }
    return this.view(user, await this.employees.create(user.companyId, user.userId, body, request.ip));
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) body: UpdateEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Employee & { accessRestored: boolean | null }> {
    const current = await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_UPDATE, id);
    if (body.branchId !== undefined && body.branchId !== current.branchId) {
      // Moving someone to another branch is a transfer (ADR-0012): it needs employees:transfer reaching
      // both the branch they leave and the one they join.
      this.scope.assertCanAccess(user, PERMISSIONS.EMPLOYEES_TRANSFER, current, "employees.transfer_forbidden");
      this.assertBranchInReach(user, PERMISSIONS.EMPLOYEES_TRANSFER, body.branchId, id);
    }
    // Someone who only ever sees masked personal data must not overwrite it (ADR-0011 §3).
    if (touchesPersonal(body) && !this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, current)) {
      throw new ForbiddenError("Changing personal data requires the personal-data permission", "employees.sensitive_permission_required");
    }
    assertMayWriteIban(this.scope, user, body, current);
    const { employee, accessRestored } = await this.employees.update(user.companyId, user.userId, id, body, request.ip, {
      canManageAccess: this.scope.covers(user, PERMISSIONS.EMPLOYEES_MANAGE_ACCESS, current),
    });
    // accessRestored: null = not a re-activation; false = re-activated but the login was NOT restored.
    return { ...this.view(user, employee), accessRestored };
  }

  /** Re-enables a deactivated employee's login: new password by email, old one destroyed, sessions gone. */
  @Post(":id/restore-access")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_MANAGE_ACCESS)
  async restoreAccess(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_MANAGE_ACCESS, id);
    return this.employees.restoreAccess(user.companyId, user.userId, id, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_DELETE, id);
    return this.employees.remove(user.companyId, user.userId, id, request.ip);
  }

  /** Career history (ADR-0012), newest first, including a scheduled change. */
  @Get(":id/assignments")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async assignmentHistory(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<AssignmentView[]> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ, id);
    return this.assignments.list(user.companyId, id);
  }

  @Post(":id/invite")
  @RequirePermission(PERMISSIONS.EMPLOYEES_INVITE)
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(InviteEmployeeSchema)) body: InviteEmployee,
    @Req() request: FastifyRequest,
  ): Promise<Omit<Invitation, "tokenHash">> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_INVITE, id);
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
