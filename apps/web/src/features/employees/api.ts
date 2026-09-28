import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import type { Employee, NamedRef } from "@/lib/types";

export const employeesKey = ["employees"] as const;

export const useEmployees = (enabled = true) =>
  useQuery({ queryKey: employeesKey, queryFn: () => apiJson<Employee[]>("/api/v1/employees"), enabled });

export const useEmployee = (id: string | undefined) =>
  useQuery({
    queryKey: [...employeesKey, id],
    queryFn: () => apiJson<Employee>(`/api/v1/employees/${id}`),
    enabled: Boolean(id),
  });

/** Departments / branches / work schedules for the selects on the employee form. */
export const useRefs = (path: "departments" | "branches" | "work-schedules", enabled = true) =>
  useQuery({ queryKey: [path], queryFn: () => apiJson<NamedRef[]>(`/api/v1/${path}`), enabled });
