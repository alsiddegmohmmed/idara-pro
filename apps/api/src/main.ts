import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./shared/errors/http-exception.filter";
import { ConfigService } from "./shared/config/config.service";

// Local dev: load apps/api/.env with Node's built-in loader (never overrides vars already set).
// In Docker/prod there is no .env file — env comes from compose — so this is skipped.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  await app.register(helmet);
  await app.register(cors, { origin: config.env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(config.env.PORT, "0.0.0.0");
}

bootstrap();
