import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiJson } from "@/lib/api";
import type { Employee } from "@/lib/types";

/**
 * The signed-in user's own employee record, fetched once and shared (query key ["me"]).
 * An account can legitimately have none — e.g. the seeded owner/admin; GET /me/employee then answers
 * `{ employee: null }` and every "my …" screen and call is skipped.
 */
export function useMyEmployee(): { employee: Employee | null; hasEmployee: boolean; isLoading: boolean } {
  const { can } = useAuth();
  const enabled = can(PERMISSIONS.EMPLOYEES_SELF_SERVICE);
  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await apiJson<{ employee: Employee | null }>("/api/v1/me/employee")).employee,
    enabled,
    staleTime: 5 * 60_000,
  });
  return { employee: query.data ?? null, hasEmployee: Boolean(query.data), isLoading: enabled && query.isLoading };
}
