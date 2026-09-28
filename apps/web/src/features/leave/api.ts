import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

export interface LeaveType {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  paid: boolean;
  deductsBalance: boolean;
  defaultDays: number | null;
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

export const useLeaveTypes = () => useQuery({ queryKey: ["leave", "types"], queryFn: () => apiJson<LeaveType[]>("/api/v1/leave/types") });

export const useMyBalances = (enabled = true) =>
  useQuery({ queryKey: ["leave", "my-balances"], queryFn: () => apiJson<Balance[]>("/api/v1/leave/me/balances"), enabled });

export const useMyLeaveRequests = () =>
  useQuery({ queryKey: ["leave", "my-requests"], queryFn: () => apiJson<LeaveRequest[]>("/api/v1/leave/me/requests") });

export const useLeavePreview = (leaveTypeId: string, startDate: string, endDate: string) =>
  useQuery({
    queryKey: ["leave", "preview", leaveTypeId, startDate, endDate],
    queryFn: () => apiJson<{ days: number; balance: Balance }>(`/api/v1/leave/me/preview?${qs({ leaveTypeId, startDate, endDate })}`),
    enabled: Boolean(leaveTypeId && startDate && endDate && startDate <= endDate),
    retry: false,
  });

export const useLeaveRequests = (params: { status?: LeaveStatus; from?: string; to?: string }, enabled = true) =>
  useQuery({
    queryKey: ["leave", "requests", params],
    queryFn: () => apiJson<LeaveRequest[]>(`/api/v1/leave/requests?${qs(params)}`),
    enabled,
  });

export const useLeaveBalances = (year: number, enabled = true) =>
  useQuery({
    queryKey: ["leave", "balances", year],
    queryFn: () =>
      apiJson<{ year: number; rows: Array<{ employee: EmployeeRef; balances: Balance[] }> }>(`/api/v1/leave/balances?year=${year}`),
    enabled,
  });
