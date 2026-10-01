import { Body, Controller, ParseUUIDPipe, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  ApproveLeaveSchema,
  CreateLeaveRequestSchema,
  DateRangeQuerySchema,
  LeavePreviewQuerySchema,
  LeaveRequestsQuerySchema,
  PERMISSIONS,
  RejectLeaveSchema,
  SetLeaveEntitlementSchema,
  UpdateLeaveTypeSchema,
  YearQuerySchema,
  LeaveBalancesQuerySchema,
  type LeaveBalancesQuery,
  type ApproveLeave,
  type CreateLeaveRequest,
  type DateRangeQuery,
  type LeavePreviewQuery,
  type LeaveRequestsQuery,
  type RejectLeave,
  type SetLeaveEntitlement,
  type UpdateLeaveType,
  type YearQuery,
} from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { readUpload } from "../../../shared/http/read-upload";
import { sendDocumentFile } from "../../../shared/http/send-file";
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

  /** Every type, inactive included — Company setup → Leave types. */
  @Get("types/all")
  @RequirePermission(PERMISSIONS.ORG_READ)
  allTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.listAllTypes(user.companyId);
  }

  @Patch("types/:id")
  @RequirePermission(PERMISSIONS.ORG_MANAGE)
  updateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateLeaveTypeSchema)) body: UpdateLeaveType,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.updateType(user, id, body, request.ip);
  }

  // multipart/form-data with one "file" part (PDF/JPG/PNG, ≤ 10 MB) — e.g. a medical certificate.
  @Post("requests/:id/attachment")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  async attach(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest) {
    const { file } = await readUpload(request, "leave.attachment.too_large");
    return this.leave.attach(user, id, file, request.ip);
  }

  /** The requester's own copy. */
  @Get("me/requests/:id/attachment")
  @RequirePermission(PERMISSIONS.LEAVE_REQUEST)
  async myAttachment(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Res() reply: FastifyReply): Promise<void> {
    const { stream, ...file } = await this.leave.attachment(user, id);
    await sendDocumentFile(reply, stream, file);
  }

  /** For approvers / HR — scoped by the request's branch snapshot. */
  @Get("requests/:id/attachment")
  @RequirePermission(PERMISSIONS.LEAVE_READ)
  async requestAttachment(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Res() reply: FastifyReply): Promise<void> {
    const { stream, ...file } = await this.leave.attachment(user, id);
    await sendDocumentFile(reply, stream, file);
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
  balances(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(LeaveBalancesQuerySchema)) q: LeaveBalancesQuery) {
    return this.leave.balances(user, q.year, q.employeeId);
  }

  @Put("balances")
  @RequirePermission(PERMISSIONS.LEAVE_MANAGE)
  setEntitlement(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetLeaveEntitlementSchema)) body: SetLeaveEntitlement,
    @Req() request: FastifyRequest,
  ) {
    return this.leave.setEntitlement(user, body, request.ip);
  }
}
