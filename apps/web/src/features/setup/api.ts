import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiJson, jsonBody } from "@/lib/api";

export interface Branch {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  defaultScheduleId: string | null;
  technoLinkBranchCode: string | null;
}
export interface WorkSchedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  lateGraceMin: number;
  workDays: number[];
}
export interface Holiday {
  id: string;
  date: string;
  name: string;
  paid: boolean;
}
export interface Department {
  id: string;
  name: string;
  parentId: string | null;
}
export interface CompanySetting {
  id: string;
  key: string;
  value: unknown;
  effectiveFrom: string;
}

/** List + create/update/delete for one company-setup resource. The query key is the path, the same key the
 * employee forms use for their selects (useRefs), so a change here refreshes them too. */
export function useCrud<T extends { id: string }>(path: string, enabled = true) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: [path], queryFn: () => apiJson<T[]>(`/api/v1/${path}`), enabled });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [path] });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      apiJson<T>(id ? `/api/v1/${path}/${id}` : `/api/v1/${path}`, { method: id ? "PATCH" : "POST", ...jsonBody(body) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/${path}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return { list, save, remove };
}
