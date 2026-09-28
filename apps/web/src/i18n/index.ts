import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

// ar is the default locale (docs/architecture/overview.md); rtl/ltr is
// switched by AppShell based on the active language, not hard-coded here.
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

/** Switch language and flip the whole document direction (sidebar moves sides). */
export function setLanguage(lng: "ar" | "en"): void {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = i18n.dir(lng);
}

export default i18n;
