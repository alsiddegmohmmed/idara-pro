import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";

const RTL_LANGUAGES = new Set(["ar"]);

export function AppShell(): React.JSX.Element {
  const { t, i18n } = useTranslation();

  function toggleLanguage(): void {
    const next = i18n.language === "ar" ? "en" : "ar";
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = RTL_LANGUAGES.has(next) ? "rtl" : "ltr";
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-lg font-semibold">{t("app.name")}</span>
        <Button variant="outline" onClick={toggleLanguage}>
          {t("shell.language")}
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Outlet />
      </main>
    </div>
  );
}
