import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  CreateAssignmentSchema,
  CreateRoleSchema,
  PERMISSIONS,
  UpdateRoleSchema,
  type AccessReviewRow,
  type AccessUserView,
  type AssignmentAccessView,
  type CreateAssignment,
  type CreateRole,
  type RoleView,
  type UpdateRole,
} from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { AccessManagementService } from "../application/access-management.service";

/** Access management (ADR-0011 §5): roles, who holds them, and the access review report. */
@Controller("api/v1/access")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessController {
  constructor(private readonly access: AccessManagementService) {}

  @Get("permissions")
  @RequirePermission(PERMISSIONS.ACCESS_READ)
  permissions(): string[] {
    return Object.values(PERMISSIONS);
  }

  @Get("roles")
  @RequirePermission(PERMISSIONS.ACCESS_READ)
  roles(@CurrentUser() user: AuthenticatedUser): Promise<RoleView[]> {
    return this.access.listRoles(user.companyId);
  }

  @Post("roles")
  @RequirePermission(PERMISSIONS.ACCESS_MANAGE)
  createRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRoleSchema)) body: CreateRole,
    @Req() request: FastifyRequest,
  ): Promise<RoleView> {
    return this.access.createRole(user, body, request.ip);
  }

  @Patch("roles/:id")
  @RequirePermission(PERMISSIONS.ACCESS_MANAGE)
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) body: UpdateRole,
    @Req() request: FastifyRequest,
  ): Promise<RoleView> {
    return this.access.updateRole(user, id, body, request.ip);
  }

  @Post("roles/:id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.ACCESS_MANAGE)
  archiveRole(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.access.archiveRole(user, id, request.ip);
  }

  @Get("users")
  @RequirePermission(PERMISSIONS.ACCESS_READ)
  users(@CurrentUser() user: AuthenticatedUser): Promise<AccessUserView[]> {
    return this.access.listUsers(user.companyId);
  }

  @Post("assignments")
  @RequirePermission(PERMISSIONS.ACCESS_MANAGE)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateAssignmentSchema)) body: CreateAssignment,
    @Req() request: FastifyRequest,
  ): Promise<AssignmentAccessView> {
    return this.access.assign(user, body, request.ip);
  }

  @Delete("assignments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.ACCESS_MANAGE)
  unassign(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<void> {
    return this.access.unassign(user, id, request.ip);
  }

  @Get("review")
  @RequirePermission(PERMISSIONS.ACCESS_READ)
  review(@CurrentUser() user: AuthenticatedUser): Promise<AccessReviewRow[]> {
    return this.access.review(user.companyId);
  }
}
