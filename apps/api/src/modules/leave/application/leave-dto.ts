import type { Employee, LeaveBalance, LeaveType } from "@prisma/client";
import type { LeaveRequestWithType } from "./ports/leave-repository.port";

export interface LeaveTypeDto {
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
  jobTitle: string | null;
}

export interface LeaveRequestDto {
  id: string;
  employee: EmployeeRef | null;
  leaveType: LeaveTypeDto;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveRequestWithType["status"];
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface BalanceDto {
  leaveType: LeaveTypeDto;
  year: number;
  /** null = no yearly limit (types that don't deduct a balance). */
  entitledDays: number | null;
  usedDays: number;
  pendingDays: number;
  availableDays: number | null;
}

export const toTypeDto = (t: LeaveType): LeaveTypeDto => ({
  id: t.id,
  code: t.code,
  nameAr: t.nameAr,
  nameEn: t.nameEn,
  paid: t.paid,
  deductsBalance: t.deductsBalance,
  defaultDays: t.defaultDays,
});

export const toEmployeeRef = (e: Employee): EmployeeRef => ({
  id: e.id,
  employeeNo: e.employeeNo,
  fullNameAr: e.fullNameAr,
  fullNameEn: e.fullNameEn,
  jobTitle: e.jobTitle,
});

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function toRequestDto(r: LeaveRequestWithType, employee: Employee | null): LeaveRequestDto {
  return {
    id: r.id,
    employee: employee ? toEmployeeRef(employee) : null,
    leaveType: toTypeDto(r.leaveType),
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    days: r.days,
    reason: r.reason,
    status: r.status,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  };
}

export type BalanceRow = LeaveBalance;
