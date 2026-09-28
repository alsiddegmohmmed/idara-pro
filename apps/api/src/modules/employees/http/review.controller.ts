import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApproveIbanSchema,
  PERMISSIONS,
  RejectIbanSchema,
  RejectReviewSchema,
  type ApproveIban,
  type RejectIban,
  type RejectReview,
} from "@idara-pro/shared";
import type { Employee, EmployeeDocument } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { ReviewEmployeeChangesService, type ReviewQueue } from "../application/review-employee-changes.service";
import { toDocumentView } from "./employee-view";

/** HR review queue — IBAN submissions and documents an employee uploaded themselves. */
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewController {
  constructor(private readonly review: ReviewEmployeeChangesService) {}

  @Get("review-queue")
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async queue(@CurrentUser() user: AuthenticatedUser): Promise<Omit<ReviewQueue, "documents"> & { documents: unknown[] }> {
    const queue = await this.review.queue(user.companyId);
    return { ibans: queue.ibans, documents: queue.documents.map(toDocumentView) };
  }

  @Post("employees/:id/iban/approve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async approveIban(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApproveIbanSchema)) body: ApproveIban,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.review.approveIban(user.companyId, user.userId, id, body.expectedIban, request.ip);
  }

  @Post("employees/:id/iban/reject")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async rejectIban(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectIbanSchema)) body: RejectIban,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    return this.review.rejectIban(user.companyId, user.userId, id, body.expectedIban, body.reason, request.ip);
  }

  @Post("employees/:employeeId/documents/:id/approve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async approveDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    return toDocumentView(await this.review.approveDocument(user.companyId, user.userId, employeeId, id, request.ip));
  }

  @Post("employees/:employeeId/documents/:id/reject")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async rejectDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectReviewSchema)) body: RejectReview,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    return toDocumentView(
      await this.review.rejectDocument(user.companyId, user.userId, employeeId, id, body.reason, request.ip),
    );
  }
}
