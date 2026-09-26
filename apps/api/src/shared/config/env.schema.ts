import { z } from "zod";
import { defineEnvSchema } from "@idara-pro/shared";

export const envSchema = defineEnvSchema({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema.schema>;
