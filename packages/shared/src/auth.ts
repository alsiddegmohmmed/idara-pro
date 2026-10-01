import { z } from "zod";

/**
 * All request bodies are `.strict()` — unknown fields are rejected
 * (AGENTS.md §4 rule 5), enforced by apps/api's ZodValidationPipe.
 */

/** POST /api/v1/auth/login */
/** "١٢٣٤" / "۱۲۳۴" → "1234": phones with an Arabic keyboard type Arabic-Indic digits. */
export function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Saudi national ID (starts with 1) or iqama (starts with 2): 10 digits. */
export const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;

/** What the person typed to sign in, cleaned: Latin digits, no spaces; emails lower-cased. */
export function normalizeLoginIdentifier(value: string): string {
  const v = normalizeDigits(value).trim();
  return v.includes("@") ? v.toLowerCase() : v.replace(/[\s-]/g, "");
}

/**
 * POST /api/v1/auth/login. `identifier` = national ID / iqama number for employees; an email only for accounts
 * with no employee record (e.g. the system admin).
 */
export const LoginRequestSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(256),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** A new password: 8–128 characters and not only digits (not an ID number, phone or date). */
export const NewPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((p) => !/^\d+$/.test(normalizeDigits(p)), { message: "password_digits_only" });

/** POST /api/v1/auth/password-reset/request */
export const PasswordResetRequestSchema = z
  .object({
    /** National ID / iqama number, or the email of an account without an employee record. */
    identifier: z.string().trim().min(1).max(254),
  })
  .strict();
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/** POST /api/v1/auth/password-reset/confirm */
export const PasswordResetConfirmSchema = z
  .object({
    token: z.string().min(1),
    newPassword: NewPasswordSchema,
  })
  .strict();
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;

/** POST /api/v1/auth/invitations/accept */
export const AcceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    password: NewPasswordSchema,
  })
  .strict();
export type AcceptInvitation = z.infer<typeof AcceptInvitationSchema>;

/** GET /api/v1/auth/access — the caller's own access (ADR-0011 §4). */
export interface AccessView {
  userId: string;
  employeeId: string | null;
  homeBranchId: string | null;
  /** Permission code → widest reach (own < team < branch < company). */
  permissions: Record<string, "own" | "team" | "branch" | "company">;
  /** True when some permission reaches every branch. */
  allBranches: boolean;
  /** Otherwise: the branches reached by any permission. */
  branchIds: string[];
}
