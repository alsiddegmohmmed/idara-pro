import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const { t } = useTranslation();
  if (status === "loading") return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return <>{children}</>;
}
