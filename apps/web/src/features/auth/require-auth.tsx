import type { RoleScope } from "@idara-pro/shared";
import type { ReactNode } from "react";
import { ForbiddenPage } from "@/components/status-pages";
import { useAuth } from "./auth-context";

/**
 * Route-level permission gate, used inside ProtectedLayout (which already guarantees a session).
 * `permission`: one code, or a list meaning "any of these". Without it the page shows a clear
 * "no access" page — never a silent redirect. The server enforces the same rule on every call.
 */
export function RequirePermission({
  children,
  permission,
  minScope,
}: {
  children: ReactNode;
  permission: string | string[];
  minScope?: RoleScope;
}): React.JSX.Element {
  const { can } = useAuth();
  const required = Array.isArray(permission) ? permission : [permission];
  if (!required.some((p) => can(p, minScope))) return <ForbiddenPage />;
  return <>{children}</>;
}

/** Declarative "show this only if allowed" for buttons and panels. */
export function Can({
  permission,
  minScope,
  children,
}: {
  permission: string | string[];
  minScope?: RoleScope;
  children: ReactNode;
}): React.JSX.Element | null {
  const { can } = useAuth();
  const required = Array.isArray(permission) ? permission : [permission];
  return required.some((p) => can(p, minScope)) ? <>{children}</> : null;
}
