import { z } from "zod";

/**
 * All request bodies are `.strict()` — unknown fields are rejected
 * (AGENTS.md §4 rule 5), enforced by apps/api's ZodValidationPipe.
 */

/** POST /api/v1/auth/login */
export const LoginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** POST /api/v1/auth/password-reset/request */
export const PasswordResetRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/** POST /api/v1/auth/password-reset/confirm */
export const PasswordResetConfirmSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict();
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
