import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiJson } from "@/lib/api";

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "holiday" | "weekend";
export type BoardState = AttendanceStatus | "not_yet";
export type DayKind = "working" | "weekend" | "holiday";

export interface AttendanceDay {
  id: string;
  employeeId: string;
  workDate: string;
  status: AttendanceStatus | null;
  firstInAt: string | null;
  lastOutAt: string | null;
  lateMin: number;
  workedMin: number;
  missingCheckout: boolean;
  corrected: boolean;
}

export interface Punch {
  id: string;
  kind: "in" | "out";
  at: string;
  distanceM: number | null;
  accuracyM: number;
  accepted: boolean;
}

export interface EmployeeRef {
  id: string;
  employeeNo: string;
  fullNameAr: string;
  fullNameEn: string;
  jobTitle: string | null;
  branchId: string | null;
}

export interface Today {
  workDate: string;
  kind: DayKind;
  day: AttendanceDay | null;
  punches: Punch[];
}

export interface BoardRow {
  employee: EmployeeRef;
  state: BoardState;
  day: AttendanceDay | null;
}

export interface ReportRow {
  employee: EmployeeRef;
  workingDays: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  lateMin: number;
  workedMin: number;
  missingCheckouts: number;
}

export const attendanceKeys = {
  today: ["attendance", "today"] as const,
  myDays: (from: string, to: string) => ["attendance", "my-days", from, to] as const,
  board: (date: string, branchId: string) => ["attendance", "board", date, branchId] as const,
  report: (month: string, branchId: string) => ["attendance", "report", month, branchId] as const,
};

const qs = (params: Record<string, string | undefined>): string =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();

export function useToday(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: attendanceKeys.today,
    queryFn: () => apiJson<Today>("/api/v1/attendance/me/today"),
    enabled: enabled && can(PERMISSIONS.ATTENDANCE_PUNCH),
  });
}

export function useMyDays(from: string, to: string) {
  const { can } = useAuth();
  return useQuery({
    queryKey: attendanceKeys.myDays(from, to),
    queryFn: () => apiJson<AttendanceDay[]>(`/api/v1/attendance/me/days?${qs({ from, to })}`),
    enabled: can(PERMISSIONS.ATTENDANCE_PUNCH),
  });
}

export function useBoard(date: string, branchId: string, enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: attendanceKeys.board(date, branchId),
    queryFn: () => apiJson<{ workDate: string; rows: BoardRow[] }>(`/api/v1/attendance/board?${qs({ date, branchId })}`),
    enabled: enabled && can(PERMISSIONS.ATTENDANCE_READ),
    refetchInterval: 60_000,
  });
}

export function useReport(month: string, branchId: string) {
  const { can } = useAuth();
  return useQuery({
    queryKey: attendanceKeys.report(month, branchId),
    queryFn: () => apiJson<{ month: string; rows: ReportRow[] }>(`/api/v1/attendance/report?${qs({ month, branchId })}`),
    enabled: can(PERMISSIONS.ATTENDANCE_READ),
  });
}

export const reportExcelPath = (month: string, branchId: string): string => `/api/v1/attendance/report.xlsx?${qs({ month, branchId })}`;
