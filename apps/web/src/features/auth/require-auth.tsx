import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export function RequireAuth({
  children,
  permission,
}: {
  children: ReactNode;
  /** Redirect home when the signed-in user lacks this permission — or all of these (the server enforces it too). */
  permission?: string | string[];
}): React.JSX.Element {
  const { status, can } = useAuth();
  const { t } = useTranslation();
  if (status === "loading") return <p className="text-dense text-ink-muted">{t("common.loading")}</p>;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  const required = permission === undefined ? [] : Array.isArray(permission) ? permission : [permission];
  if (required.length > 0 && !required.some((p) => can(p))) return <Navigate to="/" replace />;
  return <>{children}</>;
}
