import { PERMISSIONS } from "@idara-pro/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth";

/** Landing page: just the doors this user's permissions open. */
export function HomePage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const doors = [
    { to: "/employees", title: t("nav.employees"), body: t("home.employeesBody"), show: can(PERMISSIONS.EMPLOYEES_READ) },
    { to: "/review-queue", title: t("nav.reviewQueue"), body: t("home.reviewBody"), show: can(PERMISSIONS.EMPLOYEES_REVIEW) },
    { to: "/profile", title: t("nav.myProfile"), body: t("home.profileBody"), show: can(PERMISSIONS.EMPLOYEES_SELF_SERVICE) },
  ].filter((d) => d.show);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("home.welcome")}</h1>
      {doors.length === 0 ? (
        <p className="text-muted-foreground">{t("home.nothingYet")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {doors.map((d) => (
            <Link key={d.to} to={d.to}>
              <Card className="h-full hover:border-primary">
                <p className="font-semibold">{d.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
