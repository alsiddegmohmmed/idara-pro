import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export function RequireAuth({
  children,
  permission,
}: {
  children: ReactNode;
  /** Redirect home when the signed-in user lacks this permission (the server enforces it too). */
  permission?: string;
}): React.JSX.Element {
  const { status, can } = useAuth();
  const { t } = useTranslation();
  if (status === "loading") return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
