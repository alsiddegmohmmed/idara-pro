import type { ShortLeaveRequest, Warning } from "@prisma/client";
import type { DataScope } from "../../../../shared/access/access-rules";

export const DISCIPLINE_REPOSITORY = Symbol("DISCIPLINE_REPOSITORY");

/** Warnings and short permissions. Lists take a DataScope and filter by each record's branch snapshot (ADR-0012). */
export interface DisciplineRepositoryPort {
  createWarning(companyId: string, data: Pick<Warning, "employeeId" | "branchId" | "type" | "reason" | "incidentDate" | "proposedBy">): Promise<Warning>;
  lockWarning(companyId: string, id: string): Promise<Warning | null>;
  updateWarning(companyId: string, id: string, data: Partial<Warning>): Promise<Warning>;
  listWarnings(companyId: string, f: { scope?: DataScope; employeeIds?: string[]; status?: string; statuses?: string[] }): Promise<Warning[]>;

  createShortLeave(
    companyId: string,
    data: Pick<ShortLeaveRequest, "employeeId" | "branchId" | "date" | "kind" | "fromTime" | "toTime" | "minutes" | "reason">,
  ): Promise<ShortLeaveRequest>;
  lockShortLeave(companyId: string, id: string): Promise<ShortLeaveRequest | null>;
  findShortLeave(companyId: string, id: string): Promise<ShortLeaveRequest | null>;
  updateShortLeave(companyId: string, id: string, data: Partial<ShortLeaveRequest>): Promise<ShortLeaveRequest>;
  listShortLeave(
    companyId: string,
    f: { scope?: DataScope; employeeIds?: string[]; status?: string; from?: Date; to?: Date },
  ): Promise<ShortLeaveRequest[]>;
  /** Serialises one employee's requests (allowance + overlap checks). */
  lockEmployee(companyId: string, employeeId: string): Promise<void>;
}
