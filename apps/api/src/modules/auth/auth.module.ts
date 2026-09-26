import { Module } from "@nestjs/common";
import { UsersRepository } from "./infrastructure/users.repository";

// Placeholder public surface: UsersRepository only, so the tenant-isolation test
// (apps/api/test/tenant-isolation.e2e.test.ts) has a real repository to exercise.
// Stage 4 adds LoginUseCase etc. and UsersRepository likely becomes internal to
// that layer instead of being exported directly.
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class AuthModule {}
