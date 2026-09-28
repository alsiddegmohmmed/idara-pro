import type { i18n as I18n } from "i18next";

/** Arabic name in Arabic, English name otherwise. */
export function nameIn(i18n: I18n, e: { fullNameAr: string; fullNameEn: string }): string {
  return i18n.language === "ar" ? e.fullNameAr : e.fullNameEn;
}
