import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { AccessView, RoleScope } from "@idara-pro/shared";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { reachableBranches, reachesAnything, widestReach } from "../../../shared/access/access-rules";
import {
  AcceptInvitationSchema,
  type AcceptInvitation,
  LoginRequestSchema,
  type LoginRequest,
  PasswordResetConfirmSchema,
  type PasswordResetConfirm,
  PasswordResetRequestSchema,
  type PasswordResetRequest,
} from "@idara-pro/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { AcceptInvitationUseCase } from "../application/accept-invitation.use-case";
import { ConfirmPasswordResetUseCase } from "../application/confirm-password-reset.use-case";
import { LoginUseCase } from "../application/login.use-case";
import { LogoutUseCase } from "../application/logout.use-case";
import { RefreshSessionUseCase } from "../application/refresh-session.use-case";
import { RequestPasswordResetUseCase } from "../application/request-password-reset.use-case";

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly confirmPasswordResetUseCase: ConfirmPasswordResetUseCase,
    private readonly acceptInvitationUseCase: AcceptInvitationUseCase,
  ) {}

  /**
   * The caller's own access (ADR-0011 §4): every permission with its widest reach, and the branches they
   * reach at all. The web app uses it to show only what the user can act on — the API still checks every call.
   * Any signed-in user may ask about themselves, so no @RequirePermission (like logout/refresh).
   */
  @Get("access")
  @UseGuards(JwtAuthGuard)
  access(@CurrentUser() user: AuthenticatedUser): AccessView {
    const { access } = user;
    const permissions: Record<string, RoleScope> = {};
    for (const [code, grant] of Object.entries(access.grants)) if (reachesAnything(grant)) permissions[code] = widestReach(grant);
    const branches = reachableBranches(access);
    return {
      userId: user.userId,
      employeeId: access.employeeId,
      homeBranchId: access.homeBranchId,
      permissions,
      allBranches: branches.all,
      branchIds: branches.all ? [] : branches.branchIds,
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accessToken: string }> {
    const session = await this.loginUseCase.execute(body.email, body.password);
    this.setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
    return { accessToken: session.accessToken };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accessToken: string }> {
    const presented = request.cookies[REFRESH_COOKIE_NAME];
    if (!presented) {
      throw new UnauthorizedException();
    }
    const session = await this.refreshSessionUseCase.execute(presented);
    this.setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
    return { accessToken: session.accessToken };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const presented = request.cookies[REFRESH_COOKIE_NAME];
    if (presented) {
      await this.logoutUseCase.execute(presented);
    }
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Post("password-reset/request")
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(PasswordResetRequestSchema)) body: PasswordResetRequest,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.requestPasswordResetUseCase.execute(body.email, request.ip);
  }

  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(PasswordResetConfirmSchema)) body: PasswordResetConfirm,
  ): Promise<void> {
    await this.confirmPasswordResetUseCase.execute(body.token, body.newPassword);
  }

  // Public, no guard — same as password-reset/* — the caller doesn't have a
  // session yet (docs/adr/0007-invitations.md).
  @Post("invitations/accept")
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body(new ZodValidationPipe(AcceptInvitationSchema)) body: AcceptInvitation,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accessToken: string }> {
    const session = await this.acceptInvitationUseCase.execute(body.token, body.password);
    this.setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
    return { accessToken: session.accessToken };
  }

  private setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }
}
