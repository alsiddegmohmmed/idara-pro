/** Halalas are integers (1 SAR = 100 halalas) — never go through floating point. */
export function sarToHalalas(input: string): string | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = match[1] as string;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${BigInt(whole) * 100n + BigInt(fraction)}`;
}

/** "8,000.00" / "-38.98". BigInt division truncates toward zero, so the sign is handled once, up front. */
export function formatHalalas(halalas: string): string {
  const value = BigInt(halalas);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${fraction}`;
}
