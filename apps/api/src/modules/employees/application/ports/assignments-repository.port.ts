import type { EmployeeAssignment } from "@prisma/client";
import type { AssignmentValues } from "../../domain/assignment-rules";

export const ASSIGNMENTS_REPOSITORY = Symbol("ASSIGNMENTS_REPOSITORY");

export interface CreateAssignmentData extends AssignmentValues {
  employeeId: string;
  kind: "hire" | "transfer" | "change";
  validFrom: Date;
  appliedAt: Date | null;
  reason: string | null;
  createdBy: string | null;
}

/** Career history (ADR-0012). Writes must run inside the caller's transaction, under the employee row lock. */
export interface AssignmentsRepositoryPort {
  /** The applied, open-ended row, or null for an employee created before history existed. */
  findCurrent(companyId: string, employeeId: string): Promise<EmployeeAssignment | null>;
  /** Newest first, scheduled row included. */
  listByEmployee(companyId: string, employeeId: string): Promise<EmployeeAssignment[]>;
  create(companyId: string, data: CreateAssignmentData): Promise<EmployeeAssignment>;
  close(companyId: string, id: string, validTo: Date): Promise<void>;
  /** Corrects a row in place (same-day change) — only the tracked values, kind and reason. */
  replace(companyId: string, id: string, data: AssignmentValues & { kind: CreateAssignmentData["kind"]; reason: string | null }): Promise<void>;
}
