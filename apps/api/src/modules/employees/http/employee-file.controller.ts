import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  ContactSchema,
  CreateContractSchema,
  EndContractSchema,
  EnrolmentSchema,
  InsurancePolicySchema,
  PERMISSIONS,
  UpdateContactSchema,
  UpdateContractSchema,
  type ContactInput,
  type ContactView,
  type ContractView,
  type CreateContract,
  type EndContract,
  type EnrolmentInput,
  type EnrolmentView,
  type InsurancePolicyInput,
  type InsurancePolicyView,
  type UpdateContactInput,
  type UpdateContract,
} from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../shared/errors/errors";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeeFileService } from "../application/employee-file.service";
import { EmployeeScopeService } from "../application/employee-scope.service";

/**
 * Employee file (Phase 5). Every route addressed by employee checks permission AND reach for that employee:
 * contacts are personal data (employees:read-sensitive to read; plus employees:update to change), contracts
 * and insurance have their own tiers (ADR-0011 §3). Insurance policies are company-wide records.
 */
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeFileController {
  constructor(
    private readonly file: EmployeeFileService,
    private readonly scope: EmployeeScopeService,
  ) {}

  private async canChangeContacts(user: AuthenticatedUser, employeeId: string): Promise<void> {
    const employee = await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_UPDATE, employeeId);
    this.scope.assertCanAccess(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employee, "employees.sensitive_permission_required");
  }

  // ---------- contacts ----------

  @Get("employees/:employeeId/contacts")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ_SENSITIVE)
  async contacts(@CurrentUser() user: AuthenticatedUser, @Param("employeeId", ParseUUIDPipe) employeeId: string): Promise<ContactView[]> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employeeId);
    return this.file.listContacts(user.companyId, employeeId);
  }

  @Post("employees/:employeeId/contacts")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async addContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(ContactSchema)) body: ContactInput,
    @Req() request: FastifyRequest,
  ): Promise<ContactView> {
    await this.canChangeContacts(user, employeeId);
    return this.file.addContact(user.companyId, user.userId, employeeId, body, request.ip);
  }

  @Patch("employees/:employeeId/contacts/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContactSchema)) body: UpdateContactInput,
    @Req() request: FastifyRequest,
  ): Promise<ContactView> {
    await this.canChangeContacts(user, employeeId);
    return this.file.updateContact(user.companyId, user.userId, employeeId, id, body, request.ip);
  }

  @Delete("employees/:employeeId/contacts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async removeContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.canChangeContacts(user, employeeId);
    return this.file.removeContact(user.companyId, user.userId, employeeId, id, request.ip);
  }

  // ---------- contracts ----------

  @Get("employees/:employeeId/contracts")
  @RequirePermission(PERMISSIONS.CONTRACTS_READ)
  async contracts(@CurrentUser() user: AuthenticatedUser, @Param("employeeId", ParseUUIDPipe) employeeId: string): Promise<ContractView[]> {
    await this.scope.assertEmployee(user, PERMISSIONS.CONTRACTS_READ, employeeId);
    return this.file.listContracts(user.companyId, employeeId);
  }

  @Post("employees/:employeeId/contracts")
  @RequirePermission(PERMISSIONS.CONTRACTS_MANAGE)
  async createContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(CreateContractSchema)) body: CreateContract,
    @Req() request: FastifyRequest,
  ): Promise<ContractView> {
    await this.scope.assertEmployee(user, PERMISSIONS.CONTRACTS_MANAGE, employeeId);
    return this.file.createContract(user.companyId, user.userId, employeeId, body, request.ip);
  }

  @Post("employees/:employeeId/contracts/:id/renew")
  @RequirePermission(PERMISSIONS.CONTRACTS_MANAGE)
  async renewContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateContractSchema)) body: CreateContract,
    @Req() request: FastifyRequest,
  ): Promise<ContractView> {
    await this.scope.assertEmployee(user, PERMISSIONS.CONTRACTS_MANAGE, employeeId);
    return this.file.renewContract(user.companyId, user.userId, employeeId, id, body, request.ip);
  }

  @Patch("employees/:employeeId/contracts/:id")
  @RequirePermission(PERMISSIONS.CONTRACTS_MANAGE)
  async updateContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContractSchema)) body: UpdateContract,
    @Req() request: FastifyRequest,
  ): Promise<ContractView> {
    await this.scope.assertEmployee(user, PERMISSIONS.CONTRACTS_MANAGE, employeeId);
    return this.file.updateContract(user.companyId, user.userId, employeeId, id, body, request.ip);
  }

  @Post("employees/:employeeId/contracts/:id/end")
  @RequirePermission(PERMISSIONS.CONTRACTS_MANAGE)
  async endContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EndContractSchema)) body: EndContract,
    @Req() request: FastifyRequest,
  ): Promise<ContractView> {
    await this.scope.assertEmployee(user, PERMISSIONS.CONTRACTS_MANAGE, employeeId);
    return this.file.endContract(user.companyId, user.userId, employeeId, id, body, request.ip);
  }

  // ---------- insurance ----------

  @Get("insurance-policies")
  @RequirePermission(PERMISSIONS.INSURANCE_READ)
  policies(@CurrentUser() user: AuthenticatedUser): Promise<InsurancePolicyView[]> {
    return this.file.listPolicies(user.companyId);
  }

  /** Policies cover every branch, so creating or changing one needs company-wide insurance:manage. */
  private assertCompanyWide(user: AuthenticatedUser): void {
    if (!this.scope.scope(user, PERMISSIONS.INSURANCE_MANAGE)?.all) {
      throw new ForbiddenError("Insurance policies need company-wide access", "employees.insurance_policy.company_reach_required");
    }
  }

  @Post("insurance-policies")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.INSURANCE_MANAGE)
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(InsurancePolicySchema)) body: InsurancePolicyInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.assertCompanyWide(user);
    return this.file.savePolicy(user.companyId, user.userId, null, body, request.ip);
  }

  @Patch("insurance-policies/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.INSURANCE_MANAGE)
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(InsurancePolicySchema)) body: InsurancePolicyInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.assertCompanyWide(user);
    return this.file.savePolicy(user.companyId, user.userId, id, body, request.ip);
  }

  @Get("employees/:employeeId/insurance")
  @RequirePermission(PERMISSIONS.INSURANCE_READ)
  async enrolments(@CurrentUser() user: AuthenticatedUser, @Param("employeeId", ParseUUIDPipe) employeeId: string): Promise<EnrolmentView[]> {
    await this.scope.assertEmployee(user, PERMISSIONS.INSURANCE_READ, employeeId);
    return this.file.listEnrolments(user.companyId, employeeId);
  }

  @Post("employees/:employeeId/insurance")
  @RequirePermission(PERMISSIONS.INSURANCE_MANAGE)
  async enrol(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(EnrolmentSchema)) body: EnrolmentInput,
    @Req() request: FastifyRequest,
  ): Promise<EnrolmentView> {
    await this.scope.assertEmployee(user, PERMISSIONS.INSURANCE_MANAGE, employeeId);
    return this.file.enrol(user.companyId, user.userId, employeeId, body, request.ip);
  }

  @Patch("employees/:employeeId/insurance/:id")
  @RequirePermission(PERMISSIONS.INSURANCE_MANAGE)
  async updateEnrolment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EnrolmentSchema)) body: EnrolmentInput,
    @Req() request: FastifyRequest,
  ): Promise<EnrolmentView> {
    await this.scope.assertEmployee(user, PERMISSIONS.INSURANCE_MANAGE, employeeId);
    return this.file.updateEnrolment(user.companyId, user.userId, employeeId, id, body, request.ip);
  }

  @Delete("employees/:employeeId/insurance/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.INSURANCE_MANAGE)
  async removeEnrolment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.scope.assertEmployee(user, PERMISSIONS.INSURANCE_MANAGE, employeeId);
    return this.file.removeEnrolment(user.companyId, user.userId, employeeId, id, request.ip);
  }
}
