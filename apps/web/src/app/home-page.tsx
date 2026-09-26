import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";

// Placeholder landing page after login. Real dashboards arrive with Phase 1+.
export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { claims, logout } = useAuth();

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border border-border p-6">
      <h1 className="text-xl font-semibold">{t("home.welcome")}</h1>
      <p className="text-sm">{t("home.loggedIn")}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="font-medium">{t("home.userId")}</dt>
          <dd className="truncate font-mono text-xs" dir="ltr">{claims?.sub}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-medium">{t("home.permissions")}</dt>
          <dd>{claims?.permissions.length ?? 0}</dd>
        </div>
      </dl>
      <Button variant="outline" className="w-full" onClick={() => void logout()}>
        {t("home.logout")}
      </Button>
    </div>
  );
}
