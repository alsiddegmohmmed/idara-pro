/**
 * Saudi IBAN: "SA" + 2 check digits + 2-digit bank code + 18 alphanumeric characters
 * (24 total). Shared so the web form and the API run the exact same check.
 */

const SAUDI_IBAN_PATTERN = /^SA\d{4}[A-Z0-9]{18}$/;

/** Strip spaces, uppercase — the canonical stored form. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** ISO 13616 mod-97: move the first 4 chars to the end, letters -> 10..35, remainder must be 1. */
export function hasValidIbanChecksum(normalized: string): boolean {
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function isValidSaudiIban(input: string): boolean {
  const normalized = normalizeIban(input);
  return SAUDI_IBAN_PATTERN.test(normalized) && hasValidIbanChecksum(normalized);
}

/** SA•• •••• ••••1234 style — only the last 4 characters survive. */
export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const normalized = normalizeIban(iban);
  return `SA•• •••• ••••${normalized.slice(-4)}`;
}
