import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiJson } from "@/lib/api";

export interface LeaveType {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  paid: boolean;
  deductsBalance: boolean;
  defaultDays: number | null;
  /** Pay by days used in the year (sick leave); null = `paid` decides for every day. */
  payTiers: Array<{ days: number; percent: number }> | null;
  requiresAttachment: boolean;
  active?: boolean;
}

export interface EmployeeRef {
  id: string;
  employeeNo: string;
  fullNameAr: string;
  fullNameEn: string;
  jobTitle?: string | null;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employee: EmployeeRef | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  attachment: { name: string; type: string } | null;
  createdAt: string;
  canDecide?: boolean;
}

export interface Balance {
  leaveType: LeaveType;
  year: number;
  entitledDays: number | null;
  usedDays: number;
  pendingDays: number;
  availableDays: number | null;
}

const qs = (params: Record<string, string | undefined>): string =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();

/** Each hook only calls its endpoint when the user holds the permission that endpoint requires. */
function useCan(permission: string): boolean {
  return useAuth().can(permission);
}

export const useLeaveTypes = () => {
  const allowed = useCan(PERMISSIONS.LEAVE_REQUEST);
  return useQuery({ queryKey: ["leave", "types"], queryFn: () => apiJson<LeaveType[]>("/api/v1/leave/types"), enabled: allowed });
};

export const useMyBalances = (enabled = true) => {
  const allowed = useCan(PERMISSIONS.LEAVE_REQUEST);
  return useQuery({
    queryKey: ["leave", "my-balances"],
    queryFn: () => apiJson<Balance[]>("/api/v1/leave/me/balances"),
    enabled: enabled && allowed,
  });
};

export const useMyLeaveRequests = (enabled = true) => {
  const allowed = useCan(PERMISSIONS.LEAVE_REQUEST);
  return useQuery({
    queryKey: ["leave", "my-requests"],
    queryFn: () => apiJson<LeaveRequest[]>("/api/v1/leave/me/requests"),
    enabled: enabled && allowed,
  });
};

export const useLeavePreview = (leaveTypeId: string, startDate: string, endDate: string) =>
  useQuery({
    queryKey: ["leave", "preview", leaveTypeId, startDate, endDate],
    queryFn: () => apiJson<{ days: number; balance: Balance }>(`/api/v1/leave/me/preview?${qs({ leaveTypeId, startDate, endDate })}`),
    enabled: Boolean(leaveTypeId && startDate && endDate && startDate <= endDate),
    retry: false,
    // Never show (or submit on) the previous type's or range's numbers.
    placeholderData: () => undefined,
  });

export const useLeaveRequests = (params: { status?: LeaveStatus; from?: string; to?: string; employeeId?: string }, enabled = true) => {
  const allowed = useCan(PERMISSIONS.LEAVE_READ);
  return useQuery({
    queryKey: ["leave", "requests", params],
    queryFn: () => apiJson<LeaveRequest[]>(`/api/v1/leave/requests?${qs(params)}`),
    enabled: enabled && allowed,
  });
};

/** Everyone in reach for the year, or just `employeeId` (a record, a review panel). */
export const useLeaveBalances = (year: number, enabled = true, employeeId?: string) => {
  const allowed = useCan(PERMISSIONS.LEAVE_READ);
  return useQuery({
    queryKey: ["leave", "balances", year, employeeId ?? ""],
    queryFn: () =>
      apiJson<{ year: number; rows: Array<{ employee: EmployeeRef; balances: Balance[] }> }>(
        `/api/v1/leave/balances?${qs({ year: String(year), employeeId })}`,
      ),
    enabled: enabled && allowed,
  });
};
