import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
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
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { EmployeeScopeService } from "../application/employee-scope.service";
import { ReviewEmployeeChangesService, type ReviewQueue } from "../application/review-employee-changes.service";
import { EmployeeDocumentsService } from "../application/employee-documents.service";
import { toDocumentView, toEmployeeView } from "./employee-view";
import { sendDocumentFile } from "./send-document-file";

/** HR review queue — IBAN submissions and documents an employee uploaded themselves. */
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewController {
  constructor(
    private readonly review: ReviewEmployeeChangesService,
    private readonly documents: EmployeeDocumentsService,
    private readonly scope: EmployeeScopeService,
  ) {}

  private view(user: AuthenticatedUser, employee: Employee): Employee {
    return toEmployeeView(employee, this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, employee));
  }

  @Get("review-queue")
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async queue(@CurrentUser() user: AuthenticatedUser): Promise<Omit<ReviewQueue, "documents"> & { documents: unknown[] }> {
    const scope = this.scope.scope(user, PERMISSIONS.EMPLOYEES_REVIEW);
    if (!scope) return { ibans: [], documents: [] };
    const queue = await this.review.queue(user.companyId, user.userId, scope);
    return {
      ibans: queue.ibans,
      // isOwn is all the UI needs; the linked user's id stays server-side.
      documents: queue.documents.map(({ employee: { userId, ...employee }, ...document }) => {
        void userId;
        return { ...toDocumentView(document), employee };
      }),
    };
  }

  /** Open a document that is in the queue — reviewers don't need employees:read for this. */
  @Get("review-queue/documents/:employeeId/:id/file")
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async downloadPendingDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_REVIEW, employeeId);
    await this.review.assertDocumentInQueue(user.companyId, employeeId, id);
    const { stream, document } = await this.documents.download(user.companyId, user.userId, employeeId, id, request.ip);
    await sendDocumentFile(reply, stream, document);
  }

  @Post("employees/:id/iban/approve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async approveIban(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveIbanSchema)) body: ApproveIban,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_REVIEW, id);
    return this.view(user, await this.review.approveIban(user.companyId, user.userId, id, body.expectedIban, request.ip));
  }

  @Post("employees/:id/iban/reject")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async rejectIban(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectIbanSchema)) body: RejectIban,
    @Req() request: FastifyRequest,
  ): Promise<Employee> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_REVIEW, id);
    return this.view(user, await this.review.rejectIban(user.companyId, user.userId, id, body.expectedIban, body.reason, request.ip));
  }

  @Post("employees/:employeeId/documents/:id/approve")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async approveDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_REVIEW, employeeId);
    return toDocumentView(await this.review.approveDocument(user.companyId, user.userId, employeeId, id, request.ip));
  }

  @Post("employees/:employeeId/documents/:id/reject")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.EMPLOYEES_REVIEW)
  async rejectDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId", ParseUUIDPipe) employeeId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectReviewSchema)) body: RejectReview,
    @Req() request: FastifyRequest,
  ): Promise<Omit<EmployeeDocument, "fileKey">> {
    await this.scope.assertEmployee(user, PERMISSIONS.EMPLOYEES_REVIEW, employeeId);
    return toDocumentView(
      await this.review.rejectDocument(user.companyId, user.userId, employeeId, id, body.reason, request.ip),
    );
  }
}
