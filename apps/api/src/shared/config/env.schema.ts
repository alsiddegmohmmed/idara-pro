import { z } from "zod";
import { defineEnvSchema } from "@idara-pro/shared";
import { redisUrlProblem } from "./redis-url";

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
  // Used by the worker (queue consumer) and the API (email queue producer, rate limiting) — ADR-0006/0008.
  // Fail fast on a malformed value (typically an unencoded character in the prod password).
  REDIS_URL: z
    .string()
    .default("redis://localhost:6379")
    .superRefine((value, ctx) => {
      const problem = redisUrlProblem(value);
      if (problem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `not a valid Redis URL: ${problem}. Expected redis://[:password@]host[:port][/db].`,
        });
      }
    }),
  // docs/domain/business-rules.md marks these thresholds TBD — a setting,
  // not an invented rule (AGENTS.md §6 rule 7), until the owner confirms them.
  DOCUMENT_EXPIRY_REMINDER_DAYS: z.string().min(1).default("60,30,7"),
  // Daily at 07:00 Asia/Riyadh (tz applied where this is used, not baked into
  // the cron string itself).
  DOCUMENT_EXPIRY_CRON: z.string().min(1).default("0 7 * * *"),
  // Nightly attendance close (absent / missing check-out for yesterday), Asia/Riyadh.
  ATTENDANCE_CLOSE_CRON: z.string().min(1).default("15 0 * * *"),
  // docs/adr/0008-email-and-self-service.md. Defaults match dev Mailpit (SMTP on
  // 1025, no auth). Only the worker sends mail; the API needs no working SMTP.
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().min(1).default("Idara Pro <noreply@idara.local>"),
  // Base URL of the web app, used only to build links inside emails.
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  // Proxies (Caddy) allowed to set X-Forwarded-For, comma-separated CIDRs; empty = trust nobody.
  // Read in main.ts before the app exists (see shared/config/trust-proxy.ts).
  TRUST_PROXY: z.string().default(""),
});

export type Env = z.infer<typeof envSchema.schema>;
