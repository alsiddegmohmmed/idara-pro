import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./shared/config/config.module";
import { ClockModule } from "./shared/clock/clock.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
      },
    }),
    HealthModule,
  ],
})
export class AppModule {}
