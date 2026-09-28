import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ConfigService } from "./shared/config/config.service";
import { parseTrustProxy } from "./shared/config/trust-proxy";
import { MAX_UPLOAD_BYTES } from "./shared/storage/detect-file-type";

// Local dev: load apps/api/.env with Node's built-in loader (never overrides vars already set).
// In Docker/prod there is no .env file — env comes from compose — so this is skipped.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: parseTrustProxy(process.env.TRUST_PROXY) }), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  await app.register(helmet);
  await app.register(cors, { origin: config.env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  // Employee document uploads (ADR-0005 FileStorage) — 10MB cap for both HR and
  // self-service uploads (MAX_UPLOAD_BYTES); real file type is checked by magic
  // bytes in EmployeeDocumentsService, not here.
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } });

  // AllExceptionsFilter is registered via APP_FILTER in AppModule, not here —
  // see the comment there for why.

  await app.listen(config.env.PORT, "0.0.0.0");
}

bootstrap();
