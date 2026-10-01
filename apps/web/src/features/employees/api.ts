import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiJson } from "@/lib/api";
import type { Employee, NamedRef } from "@/lib/types";

export const employeesKey = ["employees"] as const;

export function useEmployees(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: employeesKey,
    queryFn: () => apiJson<Employee[]>("/api/v1/employees"),
    enabled: enabled && can(PERMISSIONS.EMPLOYEES_READ),
  });
}

export const employeeQuery = (id: string) => ({
  queryKey: [...employeesKey, id],
  queryFn: () => apiJson<Employee>(`/api/v1/employees/${id}`),
});

export const useEmployee = (id: string | undefined) =>
  useQuery({
    ...employeeQuery(id ?? ""),
    enabled: Boolean(id),
    // A record never shows the previous record while the next one loads.
    placeholderData: () => undefined,
  });

/** Permission each reference list needs on the API — the hook never asks for what it can't get. */
export const REF_PERMISSION = {
  departments: PERMISSIONS.EMPLOYEES_READ,
  branches: PERMISSIONS.ORG_READ,
  "work-schedules": PERMISSIONS.ORG_READ,
} as const;

/** Departments / branches / work schedules for filters and selects. */
export function useRefs(path: keyof typeof REF_PERMISSION, enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: [path],
    queryFn: () => apiJson<NamedRef[]>(`/api/v1/${path}`),
    enabled: enabled && can(REF_PERMISSION[path]),
  });
}
