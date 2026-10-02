import { Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { PERMISSIONS, type ImportReport } from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { readUpload } from "../../../shared/http/read-upload";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { ImportEmployeesUseCase } from "../application/import-employees.use-case";

/** ?dryRun=false saves; anything else (the default) only checks. */
const ImportQuerySchema = z.object({ dryRun: z.enum(["true", "false"]).default("true") }).strict();

/** Excel import of employees: the template to fill in, then upload it for a dry run and the real run. */
@Controller("api/v1/employees/import")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeImportController {
  constructor(private readonly importer: ImportEmployeesUseCase) {}

  @Get("template.xlsx")
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  async template(@CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply): Promise<void> {
    const file = await this.importer.template(user.companyId);
    await reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="employees-import-template.xlsx"')
      .header("Cache-Control", "no-store")
      .send(file);
  }

  // multipart/form-data with one "file" part (the filled-in template).
  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ImportQuerySchema)) q: z.infer<typeof ImportQuerySchema>,
    @Req() request: FastifyRequest,
  ): Promise<ImportReport> {
    const { file } = await readUpload(request, "employees.import.too_large");
    return this.importer.run(user, file.buffer, q.dryRun !== "false", request.ip);
  }
}
