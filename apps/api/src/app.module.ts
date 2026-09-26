import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./shared/config/config.module";
import { ClockModule } from "./shared/clock/clock.module";
import { DatabaseModule } from "./shared/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
