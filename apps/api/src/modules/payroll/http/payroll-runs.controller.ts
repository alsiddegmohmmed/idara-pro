import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  CreatePayrollRunSchema,
  PERMISSIONS,
  type CreatePayrollRun,
  type PayrollItemView,
  type PayrollRunDetail,
  type PayrollRunView,
} from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { PayrollRunsService } from "../application/payroll-runs.service";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollRunsController {
  constructor(private readonly payroll: PayrollRunsService) {}

  @Get("payroll-runs")
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  list(@CurrentUser() user: AuthenticatedUser): Promise<PayrollRunView[]> {
    return this.payroll.list(user);
  }

  /** Calculates a month. Send an `Idempotency-Key` so a double click creates one run. */
  @Post("payroll-runs")
  @RequirePermission(PERMISSIONS.PAYROLL_RUN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePayrollRunSchema)) body: CreatePayrollRun,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<PayrollRunDetail> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BusinessRuleError("idempotency.invalid_key", "Idempotency-Key must be 8-100 letters, digits, - or _");
    }
    return this.payroll.create(user, body.period, request.ip, idempotencyKey);
  }

  @Get("payroll-runs/:id")
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<PayrollRunDetail> {
    return this.payroll.get(user, id);
  }

  @Post("payroll-runs/:id/recalculate")
  @RequirePermission(PERMISSIONS.PAYROLL_RUN)
  recalculate(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<PayrollRunDetail> {
    return this.payroll.recalculate(user, id, request.ip);
  }

  @Post("payroll-runs/:id/approve")
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Req() request: FastifyRequest): Promise<PayrollRunDetail> {
    return this.payroll.approve(user, id, request.ip);
  }

  /** Techno Link workbook (manual entry by the accountant, ADR-0003). */
  @Get("payroll-runs/:id/export.xlsx")
  @RequirePermission(PERMISSIONS.EXPORTS_CREATE)
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { period, buffer } = await this.payroll.export(user, id, request.ip);
    await reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="payroll-${period}.xlsx"`)
      .header("Cache-Control", "no-store")
      .send(buffer);
  }

  @Get("payroll-items/:id")
  @RequirePermission(PERMISSIONS.PAYROLL_READ)
  item(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<PayrollItemView> {
    return this.payroll.item(user, id);
  }

  @Get("me/payslips")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  myPayslips(@CurrentUser() user: AuthenticatedUser): Promise<PayrollItemView[]> {
    return this.payroll.myPayslips(user);
  }

  @Get("me/payslips/:id")
  @RequirePermission(PERMISSIONS.EMPLOYEES_SELF_SERVICE)
  myPayslip(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<PayrollItemView> {
    return this.payroll.myPayslip(user, id);
  }
}
