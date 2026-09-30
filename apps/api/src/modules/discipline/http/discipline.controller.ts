import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  CreateShortLeaveSchema,
  DecisionNoteSchema,
  PERMISSIONS,
  ProposeWarningSchema,
  RequiredReasonSchema,
  type CreateShortLeave,
  type DecisionNote,
  type ProposeWarning,
  type RequiredReason,
  type ShortLeaveAllowance,
  type ShortLeaveView,
  type WarningView,
} from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { ShortLeaveService } from "../application/shortleave.service";
import { WarningsService } from "../application/warnings.service";

const WarningListSchema = z
  .object({ status: z.enum(["proposed", "issued", "rejected", "rescinded"]).optional(), employeeId: z.string().uuid().optional() })
  .strict();
const ShortLeaveListSchema = z
  .object({ status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(), employeeId: z.string().uuid().optional() })
  .strict();
const MonthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).strict();

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisciplineController {
  constructor(
    private readonly warnings: WarningsService,
    private readonly shortLeave: ShortLeaveService,
  ) {}

  // ---------- warnings ----------

  @Get("warnings")
  @RequirePermission(PERMISSIONS.WARNINGS_READ)
  listWarnings(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(WarningListSchema)) q: z.infer<typeof WarningListSchema>): Promise<WarningView[]> {
    return this.warnings.list(user, q);
  }

  @Post("warnings")
  @RequirePermission(PERMISSIONS.WARNINGS_PROPOSE)
  propose(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(ProposeWarningSchema)) body: ProposeWarning, @Req() request: FastifyRequest): Promise<WarningView> {
    return this.warnings.propose(user, body, request.ip);
  }

  @Post("warnings/:id/issue")
  @RequirePermission(PERMISSIONS.WARNINGS_ISSUE)
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<WarningView> {
    return this.warnings.issue(user, id, body.note, request.ip);
  }

  @Post("warnings/:id/reject")
  @RequirePermission(PERMISSIONS.WARNINGS_ISSUE)
  rejectWarning(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<WarningView> {
    return this.warnings.reject(user, id, body.note, request.ip);
  }

  @Post("warnings/:id/rescind")
  @RequirePermission(PERMISSIONS.WARNINGS_RESCIND)
  rescind(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequiredReasonSchema)) body: RequiredReason,
    @Req() request: FastifyRequest,
  ): Promise<WarningView> {
    return this.warnings.rescind(user, id, body.reason, request.ip);
  }

  @Get("me/warnings")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  myWarnings(@CurrentUser() user: AuthenticatedUser): Promise<WarningView[]> {
    return this.warnings.mine(user);
  }

  @Post("me/warnings/:id/acknowledge")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<WarningView> {
    return this.warnings.acknowledge(user, id, request.ip);
  }

  // ---------- short permissions ----------

  @Get("shortleave/me/allowance")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_REQUEST)
  allowance(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(MonthSchema)) q: z.infer<typeof MonthSchema>): Promise<ShortLeaveAllowance> {
    return this.shortLeave.allowance(user, q.month);
  }

  @Get("shortleave/me/requests")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_REQUEST)
  myRequests(@CurrentUser() user: AuthenticatedUser): Promise<ShortLeaveView[]> {
    return this.shortLeave.mine(user);
  }

  @Post("shortleave/requests")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_REQUEST)
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateShortLeaveSchema)) body: CreateShortLeave,
    @Req() request: FastifyRequest,
  ): Promise<ShortLeaveView> {
    return this.shortLeave.create(user, body, request.ip);
  }

  @Post("shortleave/requests/:id/cancel")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_REQUEST)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<ShortLeaveView> {
    return this.shortLeave.cancel(user, id, request.ip);
  }

  @Get("shortleave/requests")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(ShortLeaveListSchema)) q: z.infer<typeof ShortLeaveListSchema>): Promise<ShortLeaveView[]> {
    return this.shortLeave.list(user, q);
  }

  @Post("shortleave/requests/:id/approve")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_APPROVE)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<ShortLeaveView> {
    return this.shortLeave.approve(user, id, body.note, request.ip);
  }

  @Post("shortleave/requests/:id/reject")
  @RequirePermission(PERMISSIONS.SHORTLEAVE_APPROVE)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DecisionNoteSchema)) body: DecisionNote,
    @Req() request: FastifyRequest,
  ): Promise<ShortLeaveView> {
    return this.shortLeave.reject(user, id, body.note, request.ip);
  }
}
