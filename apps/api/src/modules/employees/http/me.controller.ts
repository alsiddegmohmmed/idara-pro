import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  ContactSchema,
  CreateEmployeeDocumentSchema,
  MyProfileUpdateSchema,
  UpdateContactSchema,
  type ContactInput,
  type ContactView,
  type ContractView,
  type EnrolmentView,
  type UpdateContactInput,
  PERMISSIONS,
  SubmitIbanSchema,
  type CreateEmployeeDocument,
  type MyProfileUpdate,
  type MyWorkplaceView,
  type SubmitIban,
} from "@idara-pro/shared";
import type { Employee, EmployeeDocument, SalaryComponent } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeeFileService } from "../application/employee-file.service";
import { MyProfileService } from "../application/my-profile.service";
import { toDocumentView } from "./employee-view";
import { readUpload } from "../../../shared/http/read-upload";
import { sendDocumentFile } from "../../../shared/http/send-file";

/**
 * Employee self-service. No :employeeId anywhere — every route acts on the
 * record linked to the caller's own user id (docs/adr/0008-email-and-self-service.md).
 * The employee sees their own IBAN in full, so no masking here.
 */
@Controller("api/v1/me")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeController {
  constructor(
    private readonly profile: MyProfileService,
    private readonly file: EmployeeFileService,
  ) {}

  private async myId(user: AuthenticatedUser): Promise<string> {
    return (await this.profile.getProfile(user.companyId, user.userId)).id;
  }

  /** My relatives / trusted contacts: the employee keeps them up to date themself (audited). */
  @Get("contacts")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async contacts(@CurrentUser() user: AuthenticatedUser): Promise<ContactView[]> {
    return this.file.listContacts(user.companyId, await this.myId(user));
  }

  @Post("contacts")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async addContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ContactSchema)) body: ContactInput,
    @Req() request: FastifyRequest,
  ): Promise<ContactView> {
    return this.file.addContact(user.companyId, user.userId, await this.myId(user), body, request.ip);
  }

  @Patch("contacts/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateContactSchema)) body: UpdateContactInput,
    @Req() request: FastifyRequest,
  ): Promise<ContactView> {
    return this.file.updateContact(user.companyId, user.userId, await this.myId(user), id, body, request.ip);
  }

  @Delete("contacts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async removeContact(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.file.removeContact(user.companyId, user.userId, await this.myId(user), id, request.ip);
  }

  /** My contracts and insurance: read-only for the employee. */
  @Get("contracts")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async contracts(@CurrentUser() user: AuthenticatedUser): Promise<ContractView[]> {
    return this.file.listContracts(user.companyId, await this.myId(user));
  }

  @Get("insurance")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async insurance(@CurrentUser() user: AuthenticatedUser): Promise<EnrolmentView[]> {
    return this.file.listEnrolments(user.companyId, await this.myId(user));
  }

  /** Whether this login is linked to an employee record: 200 with null when it isn't (e.g. the seeded
   * admin), so the web app can skip every "my …" screen without provoking 404s. */
  @Get("employee")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async getLinkedEmployee(@CurrentUser() user: AuthenticatedUser): Promise<{ employee: Employee | null }> {
    return { employee: await this.profile.findLinked(user.companyId, user.userId) };
  }

  @Get("workplace")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  getWorkplace(@CurrentUser() user: AuthenticatedUser): Promise<MyWorkplaceView> {
    return this.profile.getWorkplace(user.companyId, user.userId);
  }

  @Get("profile")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<Employee> {
    return this.profile.getProfile(user.companyId, user.userId);
  }

  @Patch("profile")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(MyProfileUpdateSchema)) body: MyProfileUpdate,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.profile.updateProfile(user.companyId, user.userId, body, request.ip);
  }

  @Post("iban")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  submitIban(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SubmitIbanSchema)) body: SubmitIban,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.profile.submitIban(user.companyId, user.userId, body.iban, request.ip);
  }

  @Get("salary-components")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  salaryComponents(@CurrentUser() user: AuthenticatedUser): Promise<SalaryComponent[]> {
    return this.profile.listSalaryComponents(user.companyId, user.userId);
  }

  @Get("documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async documents(@CurrentUser() user: AuthenticatedUser): Promise<Array<Omit<EmployeeDocument, "fileKey">>> {
    return (await this.profile.listDocuments(user.companyId, user.userId)).map(toDocumentView);
  }

  // multipart/form-data: type, number, issueDate?, expiryDate? + one "file" part.
  @Post("documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    const { fields, file } = await readUpload(request);
    const metadata = new ZodValidationPipe(CreateEmployeeDocumentSchema).transform(fields) as CreateEmployeeDocument;
    return toDocumentView(await this.profile.uploadDocument(user.companyId, user.userId, metadata, file, request.ip));
  }

  @Get("documents/:id/file")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  async downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, document } = await this.profile.downloadDocument(user.companyId, user.userId, id, request.ip);
    await sendDocumentFile(reply, stream, document);
  }
}
