import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./shared/config/config.module";
import { ClockModule } from "./shared/clock/clock.module";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth";
import { AuditModule } from "./modules/audit";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    EventsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
    HealthModule,
    AuthModule,
    AuditModule,
  ],
})
export class AppModule {}
