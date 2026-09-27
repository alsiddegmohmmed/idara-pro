import {
  BadRequestException,
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

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeDocumentsController {
  constructor(private readonly documents: EmployeeDocumentsService) {}

  @Get("employees/:employeeId/documents")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
  ): Promise<EmployeeDocument[]> {
    return this.documents.listByEmployee(user.companyId, employeeId);
  }

  @Get("employees/:employeeId/documents/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<EmployeeDocument> {
    return this.documents.findById(user.companyId, id);
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
  ): Promise<EmployeeDocument> {
    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; contentType: string } | undefined;

    for await (const part of request.parts()) {
      if (part.type === "file") {
        file = { buffer: await part.toBuffer(), contentType: part.mimetype };
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!file) {
      throw new BadRequestException("A file is required");
    }
    const metadata = new ZodValidationPipe(CreateEmployeeDocumentSchema).transform(fields) as CreateEmployeeDocument;

    return this.documents.upload(user.companyId, user.userId, employeeId, metadata, file, request.ip);
  }

  @Patch("employees/:employeeId/documents/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeDocumentSchema)) body: UpdateEmployeeDocument,
    @Req() request: FastifyRequest,
  ): Promise<EmployeeDocument> {
    return this.documents.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete("employees/:employeeId/documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.documents.remove(user.companyId, user.userId, id, request.ip);
  }

  @Get("employees/:employeeId/documents/:id/file")
  @RequirePermission(PERMISSIONS.EMPLOYEES_READ)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, document } = await this.documents.download(user.companyId, user.userId, id, request.ip);
    reply.header("Content-Type", document.contentType);
    reply.header("Content-Disposition", `attachment; filename="${document.type}-${document.id}"`);
    await reply.send(stream);
  }
}
