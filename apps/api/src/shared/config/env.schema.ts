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
});

export type Env = z.infer<typeof envSchema.schema>;
