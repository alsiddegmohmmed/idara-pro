import "./shared/json-bigint-support";
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./shared/config/config.module";
import { ClockModule } from "./shared/clock/clock.module";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { TenancyModule } from "./shared/tenancy/tenancy.module";
import { StorageModule } from "./shared/storage/storage.module";
import { AllExceptionsFilter } from "./shared/errors/http-exception.filter";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth";
import { AuditModule } from "./modules/audit";
import { CompanyModule } from "./modules/company";
import { EmployeesModule } from "./modules/employees";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    EventsModule,
    TenancyModule,
    StorageModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
    HealthModule,
    AuthModule,
    AuditModule,
    CompanyModule,
    EmployeesModule,
  ],
  providers: [
    // APP_FILTER (not app.useGlobalFilters() in main.ts) so it's wired up on
    // every NestApplication built from AppModule, including in tests — a
    // manual main.ts-only registration meant every *.e2e.test.ts that builds
    // its own app via Test.createTestingModule was silently running without
    // it, undetected until a non-HttpException error (NotFoundError,
    // BusinessRuleError) first hit a real HTTP path.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
