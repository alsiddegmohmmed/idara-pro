import { Module } from "@nestjs/common";
import { AuthController } from "./http/auth.controller";
import { AcceptInvitationUseCase } from "./application/accept-invitation.use-case";
import { ConfirmPasswordResetUseCase } from "./application/confirm-password-reset.use-case";
import { InvitationsService } from "./application/invitations.service";
import { IssueSessionUseCase } from "./application/issue-session.use-case";
import { LoginUseCase } from "./application/login.use-case";
import { LogoutUseCase } from "./application/logout.use-case";
import { RefreshSessionUseCase } from "./application/refresh-session.use-case";
import { RequestPasswordResetUseCase } from "./application/request-password-reset.use-case";
import { InvitationsRepository } from "./infrastructure/invitations.repository";
import { PasswordResetTokensRepository } from "./infrastructure/password-reset-tokens.repository";
import { RefreshTokensRepository } from "./infrastructure/refresh-tokens.repository";
import { UsersRepository } from "./infrastructure/users.repository";

@Module({
  // AccessTokenService comes from the global TenancyModule (shared/tenancy) now.
  controllers: [AuthController],
  providers: [
    UsersRepository,
    RefreshTokensRepository,
    PasswordResetTokensRepository,
    InvitationsRepository,
    IssueSessionUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
    InvitationsService,
    AcceptInvitationUseCase,
  ],
  // UsersRepository: used by the tenant-isolation test and by the employees
  // module's InviteEmployeeUseCase (docs/adr/0007-invitations.md) to check an
  // invite email isn't already taken. InvitationsService: the employees
  // module's entry point for creating an invitation.
  exports: [UsersRepository, InvitationsService],
})
export class AuthModule {}
