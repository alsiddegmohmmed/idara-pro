import { Body, Controller, ParseUUIDPipe, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApproveLeaveSchema,
  CreateLeaveRequestSchema,
  DateRangeQuerySchema,
  LeavePreviewQuerySchema,
  LeaveRequestsQuerySchema,
  PERMISSIONS,
  RejectLeaveSchema,
  SetLeaveEntitlementSchema,
  YearQuerySchema,
  type ApproveLeave,
  type CreateLeaveRequest,
  type DateRangeQuery,
  type LeavePreviewQuery,
  type LeaveRequestsQuery,
  type RejectLeave,
  type SetLeaveEntitlement,
  type YearQuery,
} from "@idara-pro/shared";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { LeaveRequestsService } from "../application/leave-requests.service";

@Controller("api/v1/leave")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveRequestsService) {}

  @Get("types")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  types(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.listTypes(user.companyId);
  }

  @Get("me/balances")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  myBalances(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(YearQuerySchema)) q: YearQuery) {
    return this.leave.myBalances(user, q.year);
  }

  @Get("me/requests")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  myRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.myRequests(user);
  }

  @Get("me/preview")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  preview(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(LeavePreviewQuerySchema)) q: LeavePreviewQuery) {
    return this.leave.preview(user, q.leaveTypeId, q.startDate, q.endDate);
  }

  @Post("requests")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateLeaveRequestSchema)) body: CreateLeaveRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.create(user, body, request.ip);
  }

  @Post("requests/:id/cancel")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest) {
    return this.leave.cancel(user, id, request.ip);
  }

  @Get("requests")
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(LeaveRequestsQuerySchema)) q: LeaveRequestsQuery) {
    return this.leave.list(user, q);
  }

  @Post("requests/:id/approve")
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveLeaveSchema)) body: ApproveLeave,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.approve(user, id, body.note, request.ip);
  }

  @Post("requests/:id/reject")
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectLeaveSchema)) body: RejectLeave,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.reject(user, id, body.note, request.ip);
  }

  @Get("calendar")
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  calendar(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(DateRangeQuerySchema)) q: DateRangeQuery) {
    return this.leave.calendar(user, q.from, q.to);
  }

  @Get("balances")
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  balances(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(YearQuerySchema)) q: YearQuery) {
    return this.leave.balances(user, q.year);
  }

  @Put("balances")
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  setEntitlement(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetLeaveEntitlementSchema)) body: SetLeaveEntitlement,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.setEntitlement(user, body, request.ip);
  }
}
