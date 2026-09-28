/** Halalas are integers (1 SAR = 100 halalas) — never go through floating point. */
export function sarToHalalas(input: string): string | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = match[1] as string;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${BigInt(whole) * 100n + BigInt(fraction)}`;
}

export function formatHalalas(halalas: string): string {
  const value = BigInt(halalas);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole.toLocaleString("en-US")}.${fraction}`;
}
