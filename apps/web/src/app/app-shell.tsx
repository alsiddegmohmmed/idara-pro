import { PERMISSIONS } from "@idara-pro/shared";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { cn } from "@/lib/utils";

const RTL_LANGUAGES = new Set(["ar"]);

export function AppShell(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { status, can, logout } = useAuth();

  function toggleLanguage(): void {
    const next = i18n.language === "ar" ? "en" : "ar";
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = RTL_LANGUAGES.has(next) ? "rtl" : "ltr";
  }

  // Only screens the signed-in user has a permission for — UI hiding, never security.
  const links = [
    { to: "/employees", label: t("nav.employees"), show: can(PERMISSIONS.EMPLOYEES_READ) },
    { to: "/review-queue", label: t("nav.reviewQueue"), show: can(PERMISSIONS.EMPLOYEES_REVIEW) },
    { to: "/profile", label: t("nav.myProfile"), show: can(PERMISSIONS.EMPLOYEES_SELF_SERVICE) },
  ].filter((link) => link.show);
  const signedIn = status === "authenticated";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-border bg-card px-4 py-3">
        <NavLink to="/" className="text-lg font-semibold text-primary">
          {t("app.name")}
        </NavLink>
        {signedIn && (
          <nav className="flex flex-1 items-center gap-1" aria-label={t("nav.main")}>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted", isActive && "bg-muted font-medium")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className={cn("flex items-center gap-2", !signedIn && "ms-auto")}>
          {signedIn && <NotificationBell />}
          <Button variant="outline" onClick={toggleLanguage}>
            {t("shell.language")}
          </Button>
          {signedIn && (
            <Button variant="outline" onClick={() => void logout()}>
              {t("home.logout")}
            </Button>
          )}
        </div>
      </header>
      <main
        className={cn(
          "flex-1 p-4 md:p-6",
          signedIn ? "mx-auto w-full max-w-5xl" : "flex items-center justify-center",
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
