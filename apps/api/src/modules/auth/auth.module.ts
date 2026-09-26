import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessTokenService } from "../../shared/auth/access-token.service";
import { AuthController } from "./http/auth.controller";
import { ConfirmPasswordResetUseCase } from "./application/confirm-password-reset.use-case";
import { LoginUseCase } from "./application/login.use-case";
import { LogoutUseCase } from "./application/logout.use-case";
import { RefreshSessionUseCase } from "./application/refresh-session.use-case";
import { RequestPasswordResetUseCase } from "./application/request-password-reset.use-case";
import { PasswordResetTokensRepository } from "./infrastructure/password-reset-tokens.repository";
import { RefreshTokensRepository } from "./infrastructure/refresh-tokens.repository";
import { UsersRepository } from "./infrastructure/users.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    UsersRepository,
    RefreshTokensRepository,
    PasswordResetTokensRepository,
    AccessTokenService,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
  ],
  // UsersRepository stays exported for now (used only by the tenant-isolation
  // test). Everything else is internal to this module.
  exports: [UsersRepository],
})
export class AuthModule {}
