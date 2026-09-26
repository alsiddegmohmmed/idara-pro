import { z } from "zod";

/**
 * POST /api/v1/auth/login request body. Login/refresh/logout/reset land in
 * Stage 4 (docs/roadmap.md); the web login page uses this schema now so the
 * contract doesn't drift between the two.
 */
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
