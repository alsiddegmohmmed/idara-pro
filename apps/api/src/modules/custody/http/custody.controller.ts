import { Body, Controller, ParseUUIDPipe, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  ApproveCustodySchema,
  CreateCustodyRequestSchema,
  CustodyExportQuerySchema,
  CustodyRequestsQuerySchema,
  PayCustodySchema,
  PERMISSIONS,
  RejectCustodySchema,
  SettleCustodySchema,
  type ApproveCustody,
  type CreateCustodyRequest,
  type CustodyExportQuery,
  type CustodyRequestsQuery,
  type PayCustody,
  type RejectCustody,
  type SettleCustody,
} from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { buildCustodyWorkbook } from "../application/custody-export";
import { CustodyService } from "../application/custody.service";

@Controller("api/v1/custody")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustodyController {
  constructor(private readonly custody: CustodyService) {}

  @Post("requests")
  @RequirePermission(PERMISSIONS.CUSTODY_REQUEST)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateCustodyRequestSchema)) body: CreateCustodyRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.custody.create(user, body, request.ip);
  }

  @Get("me/requests")
  @RequirePermission(PERMISSIONS.CUSTODY_REQUEST)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.custody.myRequests(user);
  }

  @Post("requests/:id/cancel")
  @RequirePermission(PERMISSIONS.CUSTODY_REQUEST)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest) {
    return this.custody.cancel(user, id, request.ip);
  }

  @Get("requests")
  @RequirePermission(PERMISSIONS.CUSTODY_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(CustodyRequestsQuerySchema)) q: CustodyRequestsQuery) {
    return this.custody.list(user, q);
  }

  @Post("requests/:id/approve")
  @RequirePermission(PERMISSIONS.CUSTODY_APPROVE)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveCustodySchema)) body: ApproveCustody,
    @Req() request: FastifyRequest,
  ) {
    return this.custody.approve(user, id, body.note, request.ip);
  }

  @Post("requests/:id/reject")
  @RequirePermission(PERMISSIONS.CUSTODY_APPROVE)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectCustodySchema)) body: RejectCustody,
    @Req() request: FastifyRequest,
  ) {
    return this.custody.reject(user, id, body.note, request.ip);
  }

  @Post("requests/:id/pay")
  @RequirePermission(PERMISSIONS.CUSTODY_PAY)
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PayCustodySchema)) body: PayCustody,
    @Req() request: FastifyRequest,
  ) {
    return this.custody.pay(user, id, body.technoLinkRef, request.ip);
  }

  @Post("requests/:id/settle")
  @RequirePermission(PERMISSIONS.CUSTODY_SETTLE)
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SettleCustodySchema)) body: SettleCustody,
    @Req() request: FastifyRequest,
  ) {
    return this.custody.settle(user, id, body.settledAmountHalalas, body.note, request.ip);
  }

  /** Paid custody for Techno Link (manual entry by the accountant, ADR-0003). */
  @Get("export.xlsx")
  @RequirePermission(PERMISSIONS.EXPORTS_CREATE)
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(CustodyExportQuerySchema)) q: CustodyExportQuery,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await buildCustodyWorkbook(await this.custody.paidBetween(user, q.from, q.to));
    await reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="custody-${q.from}-${q.to}.xlsx"`)
      .header("Cache-Control", "no-store")
      .send(file);
  }
}
