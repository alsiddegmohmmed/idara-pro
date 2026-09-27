import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { WorkerModule } from "./worker.module";

// Local dev: load apps/api/.env with Node's built-in loader (never overrides
// vars already set) — same as main.ts. In Docker/prod there is no .env file,
// env comes from compose, so this is skipped.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function bootstrap(): Promise<void> {
  // No HTTP listener — this process only runs the BullMQ worker/scheduler
  // registered in DocumentExpiryJobModule (docs/adr/0006-document-expiry-job.md).
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
}

bootstrap();
