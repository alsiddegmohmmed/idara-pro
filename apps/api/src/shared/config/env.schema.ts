import { z } from "zod";
import { defineEnvSchema } from "@idara-pro/shared";

export const envSchema = defineEnvSchema({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().url(),
  // Migrations run as the owner role via DATABASE_URL (Prisma CLI reads it directly).
  // The app connects as the least-privilege idara_app role — see docs/adr/0004-rls-deferred.md.
  DATABASE_URL: z.string().min(1),
  APP_DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // ADR-0005: local dev default matches apps/api/storage/ in .gitignore;
  // prod sets this to the mounted idara_files volume path.
  FILE_STORAGE_DIR: z.string().min(1).default("./storage"),
  // ADR-0006: the worker process only (never the HTTP API process).
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  // docs/domain/business-rules.md marks these thresholds TBD — a setting,
  // not an invented rule (AGENTS.md §6 rule 7), until the owner confirms them.
  DOCUMENT_EXPIRY_REMINDER_DAYS: z.string().min(1).default("60,30,7"),
  // Daily at 07:00 Asia/Riyadh (tz applied where this is used, not baked into
  // the cron string itself).
  DOCUMENT_EXPIRY_CRON: z.string().min(1).default("0 7 * * *"),
});

export type Env = z.infer<typeof envSchema.schema>;
