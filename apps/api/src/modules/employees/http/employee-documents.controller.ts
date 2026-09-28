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
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  CreateEmployeeDocumentSchema,
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
import { EmployeeDocumentsService } from "../application/employee-documents.service";
import { toDocumentView } from "./employee-view";
import { readUpload } from "./read-upload";
import { sendDocumentFile } from "./send-document-file";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeDocumentsController {
  constructor(private readonly documents: EmployeeDocumentsService) {}

  @Get("employees/:employeeId/documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
  ): Promise<Array<Omit<EmployeeDocument, "fileKey">>> {
    return (await this.documents.listByEmployee(user.companyId, employeeId)).map(toDocumentView);
  }

  @Get("employees/:employeeId/documents/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
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
    @Param("employeeId") employeeId: string,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
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
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeDocumentSchema)) body: UpdateEmployeeDocument,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    return toDocumentView(await this.documents.update(user.companyId, user.userId, employeeId, id, body, request.ip));
  }

  @Delete("employees/:employeeId/documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.documents.remove(user.companyId, user.userId, employeeId, id, request.ip);
  }

  @Get("employees/:employeeId/documents/:id/file")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, document } = await this.documents.download(user.companyId, user.userId, employeeId, id, request.ip);
    await sendDocumentFile(reply, stream, document);
  }
}
