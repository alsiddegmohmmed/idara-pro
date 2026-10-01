import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

const STORAGE_KEY = "idara.language";

/** The viewer's last choice survives a reload (per browser; storage may be blocked — then Arabic). */
function storedLanguage(): "ar" | "en" {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

const initial = storedLanguage();
document.documentElement.lang = initial;
document.documentElement.dir = initial === "ar" ? "rtl" : "ltr";

// ar is the default locale (docs/architecture/overview.md).
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: initial,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

/** Switch language and flip the whole document direction (sidebar moves sides). */
export function setLanguage(lng: "ar" | "en"): void {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = i18n.dir(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

export default i18n;
