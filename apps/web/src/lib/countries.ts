import { COMMON_NATIONALITIES, COUNTRY_CODES } from "@idara-pro/shared";
import type { ComboboxOption } from "@/components/ui/combobox";

const displayNames = new Map<string, Intl.DisplayNames>();
function names(lang: string): Intl.DisplayNames {
  let n = displayNames.get(lang);
  if (!n) {
    n = new Intl.DisplayNames([lang], { type: "region" });
    displayNames.set(lang, n);
  }
  return n;
}

/** Country name in the viewer's language; a legacy free-text value (not a code) is shown as it is. */
export function countryName(code: string | null | undefined, lang: string): string {
  if (!code) return "";
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return names(lang).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Common nationalities first, then every country A→Z in the viewer's language; matches both languages. */
export function countryOptions(lang: string, commonLabel: string, allLabel: string): ComboboxOption[] {
  const other = lang === "ar" ? "en" : "ar";
  const option = (code: string, group: string): ComboboxOption => ({
    value: code,
    label: countryName(code, lang),
    keywords: `${countryName(code, other)} ${code}`,
    group,
  });
  const common = COMMON_NATIONALITIES.map((c) => option(c, commonLabel));
  const rest = COUNTRY_CODES.filter((c) => !COMMON_NATIONALITIES.includes(c))
    .map((c) => option(c, allLabel))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  return [...common, ...rest];
}
