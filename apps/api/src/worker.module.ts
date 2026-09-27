import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./shared/config/config.module";
import { ClockModule } from "./shared/clock/clock.module";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { StorageModule } from "./shared/storage/storage.module";
import { TenancyModule } from "./shared/tenancy/tenancy.module";
import { DocumentExpiryJobModule } from "./modules/employees";
import { NotificationsModule } from "./modules/notifications";
import { WorkerBootstrapService } from "./worker-bootstrap.service";

/**
 * Root module for the worker process (docs/adr/0006-document-expiry-job.md) —
 * a separate NestFactory.createApplicationContext(), not the HTTP AppModule.
 * Every @Global() module the HTTP process also relies on must be imported
 * here too, since this is a completely separate DI container/OS process, not
 * something that shares state with AppModule.
 */
@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    EventsModule,
    // NotificationsModule imports AuthModule for UsersRepository, and
    // AuthModule's LoginUseCase needs AccessTokenService (TenancyModule) to
    // resolve even though the worker never actually logs anyone in.
    TenancyModule,
    // DocumentExpiryJobModule imports the whole EmployeesModule to reach
    // CheckDocumentExpiriesUseCase, which also instantiates every other
    // employees provider (EmployeeDocumentsService needs FILE_STORAGE) even
    // though the job itself never touches file storage.
    StorageModule,
    // Same pino config as AppModule — no HTTP server here, so pinoHttp's
    // request-logging middleware never fires, but the underlying Logger
    // (app.get(Logger) in worker.ts) is still the structured pino logger,
    // not Nest's plain console logger.
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
    DocumentExpiryJobModule,
    NotificationsModule,
  ],
  providers: [WorkerBootstrapService],
})
export class WorkerModule {}
