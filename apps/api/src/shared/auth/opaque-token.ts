import { randomBytes, createHmac } from "node:crypto";

/**
 * For refresh tokens and password-reset tokens: high-entropy random strings,
 * not user-chosen passwords, so a fast keyed hash (not Argon2) is correct here
 * — we only need to defeat a stolen-database lookup, not brute force. Keyed
 * with JWT_REFRESH_SECRET so a DB leak alone doesn't let an attacker replay a
 * captured hash without also having the app's secret.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
