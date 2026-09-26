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
import { CreateBranchSchema, UpdateBranchSchema, PERMISSIONS, type CreateBranch, type UpdateBranch } from "@idara-pro/shared";
import type { Branch } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { BranchesService } from "../application/branches.service";

@Controller("api/v1/branches")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<Branch[]> {
    return this.branches.list(user.companyId);
  }

  @Get(":id")
  @RequirePermission(PERMISSIONS.COMPANY_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Branch> {
    return this.branches.findById(user.companyId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.COMPANY_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBranchSchema)) body: CreateBranch,
    @Req() request: FastifyRequest,
  ): Promise<Branch> {
    return this.branches.create(user.companyId, user.userId, body, request.ip);
  }

  @Patch(":id")
  @RequirePermission(PERMISSIONS.COMPANY_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateBranchSchema)) body: UpdateBranch,
    @Req() request: FastifyRequest,
  ): Promise<Branch> {
    return this.branches.update(user.companyId, user.userId, id, body, request.ip);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.COMPANY_DELETE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.branches.remove(user.companyId, user.userId, id, request.ip);
  }
}
