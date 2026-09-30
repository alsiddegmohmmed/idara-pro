import type { DataScope } from "../../../../shared/access/access-rules";
import type { LeaveBalance, LeaveRequest, LeaveRequestStatus, LeaveType } from "@prisma/client";

export const LEAVE_REPOSITORY = Symbol("LEAVE_REPOSITORY");

export type LeaveRequestWithType = LeaveRequest & { leaveType: LeaveType };

export interface LeaveRepositoryPort {
  listTypes(companyId: string, activeOnly: boolean): Promise<LeaveType[]>;
  findType(companyId: string, id: string): Promise<LeaveType | null>;
  /** Serializes all leave writes for one employee until the transaction ends (balance + overlap checks). */
  lockEmployee(companyId: string, employeeId: string): Promise<void>;
  findOverlapping(companyId: string, employeeId: string, start: Date, end: Date, excludeId?: string): Promise<LeaveRequest[]>;
  findBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number): Promise<LeaveBalance | null>;
  getOrCreateBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number, entitledDays: number): Promise<LeaveBalance>;
  listBalances(companyId: string, filter: { year: number; employeeIds?: string[] }): Promise<LeaveBalance[]>;
  setEntitlement(companyId: string, id: string, entitledDays: number): Promise<LeaveBalance>;
  addUsedDays(companyId: string, id: string, days: number): Promise<LeaveBalance>;
  /** Days in pending requests of a type in a year, optionally excluding one request. */
  sumPendingDays(companyId: string, employeeId: string, leaveTypeId: string, year: number, excludeId?: string): Promise<number>;
  create(
    companyId: string,
    data: { employeeId: string; branchId: string | null; leaveTypeId: string; startDate: Date; endDate: Date; days: number; reason: string | null; createdBy: string },
  ): Promise<LeaveRequestWithType>;
  findById(companyId: string, id: string): Promise<LeaveRequestWithType | null>;
  lockById(companyId: string, id: string): Promise<LeaveRequestWithType | null>;
  decide(
    companyId: string,
    id: string,
    data: { status: LeaveRequestStatus; decidedBy: string | null; decidedAt: Date; decisionNote: string | null },
  ): Promise<LeaveRequestWithType>;
  list(
    companyId: string,
    /** `scope` filters by each request's own branch snapshot (ADR-0012). */
    filter: { employeeIds?: string[]; scope?: DataScope; status?: LeaveRequestStatus; from?: Date; to?: Date },
  ): Promise<LeaveRequestWithType[]>;
}
