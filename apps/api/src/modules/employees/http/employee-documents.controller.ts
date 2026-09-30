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
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  CreateEmployeeDocumentSchema,
  ExpiringDocumentsQuerySchema,
  type ExpiringDocumentsQuery,
  UpdateEmployeeDocumentSchema,
  PERMISSIONS,
  type CreateEmployeeDocument,
  type UpdateEmployeeDocument,
} from "@idara-pro/shared";
import type { EmployeeDocument } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeeScopeService } from "../application/employee-scope.service";
import { EmployeeDocumentsService } from "../application/employee-documents.service";
import { toDocumentView } from "./employee-view";
import { readUpload } from "./read-upload";
import { sendDocumentFile } from "./send-document-file";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeDocumentsController {
  constructor(
    private readonly documents: EmployeeDocumentsService,
    private readonly scope: EmployeeScopeService,
  ) {}

  @Get("documents/expiring")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  expiring(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(ExpiringDocumentsQuerySchema)) q: ExpiringDocumentsQuery) {
    const scope = this.scope.scope(user, PERMISSIONS.EMPLOYEES_READ);
    return scope ? this.documents.listExpiring(user.companyId, q.days, scope) : [];
  }

  @Get("employees/:employeeId/documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ_SENSITIVE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
  ): Promise<Array<Omit<EmployeeDocument, "fileKey">>> {
    // Identity documents (iqama, passport, national ID) are personal data (ADR-0011 §3).
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employeeId);
    return (await this.documents.listByEmployee(user.companyId, employeeId)).map(toDocumentView);
  }

  @Get("employees/:employeeId/documents/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ_SENSITIVE)
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    // Identity documents (iqama, passport, national ID) are personal data (ADR-0011 §3).
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employeeId);
    return toDocumentView(await this.documents.findByIdForEmployee(user.companyId, employeeId, id));
  }

  // multipart/form-data — metadata fields (type, number, issueDate, expiryDate)
  // + one "file" part. Not @Body(): the body isn't JSON here, so it's parsed
  // by hand via request.parts() (@fastify/multipart, registered in main.ts)
  // and the metadata fields are validated through the same ZodValidationPipe
  // every other module uses, just called directly instead of via @Body().
  @Post("employees/:employeeId/documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_CREATE, employeeId);
    const { fields, file } = await readUpload(request);
    const metadata = new ZodValidationPipe(CreateEmployeeDocumentSchema).transform(fields) as CreateEmployeeDocument;

    return toDocumentView(
      await this.documents.upload(user.companyId, user.userId, employeeId, metadata, file, request.ip),
    );
  }

  @Patch("employees/:employeeId/documents/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeDocumentSchema)) body: UpdateEmployeeDocument,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_UPDATE, employeeId);
    return toDocumentView(await this.documents.update(user.companyId, user.userId, employeeId, id, body, request.ip));
  }

  @Delete("employees/:employeeId/documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_DELETE, employeeId);
    return this.documents.remove(user.companyId, user.userId, employeeId, id, request.ip);
  }

  @Get("employees/:employeeId/documents/:id/file")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ_SENSITIVE)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Identity documents (iqama, passport, national ID) are personal data (ADR-0011 §3).
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employeeId);
    const { stream, document } = await this.documents.download(user.companyId, user.userId, employeeId, id, request.ip);
    await sendDocumentFile(reply, stream, document);
  }
}
