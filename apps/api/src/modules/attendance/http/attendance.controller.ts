import { Body, Controller, ParseUUIDPipe, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  AttendanceBoardQuerySchema,
  AttendanceDaysQuerySchema,
  AttendanceReportQuerySchema,
  CorrectAttendanceSchema,
  CreatePunchSchema,
  DateRangeQuerySchema,
  PERMISSIONS,
  type AttendanceBoardQuery,
  type AttendanceDaysQuery,
  type AttendanceReportQuery,
  type CorrectAttendance,
  type CreatePunch,
  type DateRangeQuery,
} from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { buildAttendanceWorkbook } from "../application/attendance-excel";
import { AttendanceQueriesService } from "../application/attendance-queries.service";
import { CorrectAttendanceUseCase } from "../application/correct-attendance.use-case";
import { RecordPunchUseCase, type PunchResult } from "../application/record-punch.use-case";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

@Controller("api/v1/attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(
    private readonly recordPunch: RecordPunchUseCase,
    private readonly correct: CorrectAttendanceUseCase,
    private readonly queries: AttendanceQueriesService,
  ) {}

  /** Check-in/out. Send an `Idempotency-Key` so a retried request (flaky mobile network) counts once. */
  @Post("punches")
  @RequirePermission(PERMISSIONS.ATTENDANCE_PUNCH)
  punch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePunchSchema)) body: CreatePunch,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<PunchResult> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BusinessRuleError("idempotency.invalid_key", "Idempotency-Key must be 8-100 letters, digits, - or _");
    }
    return this.recordPunch.execute(user, body, idempotencyKey);
  }

  @Get("me/today")
  @RequirePermission(PERMISSIONS.ATTENDANCE_PUNCH)
  myToday(@CurrentUser() user: AuthenticatedUser) {
    return this.queries.myToday(user);
  }

  @Get("me/days")
  @RequirePermission(PERMISSIONS.ATTENDANCE_PUNCH)
  myDays(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(DateRangeQuerySchema)) q: DateRangeQuery) {
    return this.queries.myDays(user, q.from, q.to);
  }

  @Get("board")
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  board(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(AttendanceBoardQuerySchema)) q: AttendanceBoardQuery) {
    return this.queries.board(user, q.date, q.branchId);
  }

  @Get("days")
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  days(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(AttendanceDaysQuerySchema)) q: AttendanceDaysQuery) {
    return this.queries.days(user, q);
  }

  @Get("days/:id")
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  day(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.queries.dayDetail(user, id);
  }

  @Post("corrections")
  @RequirePermission(PERMISSIONS.ATTENDANCE_CORRECT)
  correctDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CorrectAttendanceSchema)) body: CorrectAttendance,
    @Req() request: FastifyRequest,
  ) {
    return this.correct.execute(user, body, request.ip);
  }

  @Get("report")
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(AttendanceReportQuerySchema)) q: AttendanceReportQuery) {
    const { month, rows } = await this.queries.report(user, q.month, q.branchId);
    return { month, rows };
  }

  @Get("report.xlsx")
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  async reportExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AttendanceReportQuerySchema)) q: AttendanceReportQuery,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { month, rows, days } = await this.queries.report(user, q.month, q.branchId);
    const file = await buildAttendanceWorkbook(month, rows, days);
    await reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="attendance-${month}.xlsx"`)
      .header("Cache-Control", "no-store")
      .send(file);
  }
}
