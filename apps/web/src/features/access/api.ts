import { PERMISSIONS, type AccessReviewRow, type AccessUserView, type RoleView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiJson } from "@/lib/api";

export const accessKeys = { roles: ["access", "roles"], users: ["access", "users"], review: ["access", "review"] } as const;

export function useAccessRoles() {
  const { can } = useAuth();
  return useQuery({ queryKey: accessKeys.roles, queryFn: () => apiJson<RoleView[]>("/api/v1/access/roles"), enabled: can(PERMISSIONS.ACCESS_READ) });
}

export function useAccessUsers() {
  const { can } = useAuth();
  return useQuery({ queryKey: accessKeys.users, queryFn: () => apiJson<AccessUserView[]>("/api/v1/access/users"), enabled: can(PERMISSIONS.ACCESS_READ) });
}

export function useAccessReview(enabled: boolean) {
  const { can } = useAuth();
  return useQuery({
    queryKey: accessKeys.review,
    queryFn: () => apiJson<AccessReviewRow[]>("/api/v1/access/review"),
    enabled: enabled && can(PERMISSIONS.ACCESS_READ),
  });
}

/** i18next treats ":" as a namespace separator, so `leave:approve` → `access.perm.leave.approve`. */
export const permissionKey = (code: string): string => `access.perm.${code.replace(":", ".")}`;

/** Codes grouped by resource, catalog order kept — for the role editor and review. */
export function groupedPermissions(): Array<{ resource: string; codes: string[] }> {
  const groups = new Map<string, string[]>();
  for (const code of Object.values(PERMISSIONS)) {
    const resource = code.split(":")[0] as string;
    groups.set(resource, [...(groups.get(resource) ?? []), code]);
  }
  return [...groups.entries()].map(([resource, codes]) => ({ resource, codes }));
}

export const roleName = (lang: string, r: { name: string; nameAr: string | null }): string => (lang === "ar" && r.nameAr ? r.nameAr : r.name);
