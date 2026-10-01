import type { Employee, EmployeeStatus, ReviewStatus } from "@prisma/client";
import type { DataScope } from "../../../../shared/access/access-rules";

export type EmployeeLockMode = "no_key" | "key";

export const EMPLOYEES_REPOSITORY = Symbol("EMPLOYEES_REPOSITORY");

export interface CreateEmployeeData {
  employeeNo: string;
  fullNameAr: string;
  fullNameEn: string;
  nationalId: string;
  nationality: string;
  isSaudi: boolean;
  jobTitle?: string | null;
  departmentId?: string | null;
  branchId?: string | null;
  scheduleId?: string | null;
  managerId?: string | null;
  hireDate: Date;
  endDate?: Date | null;
  status: EmployeeStatus;
  iban?: string | null;
  gender?: string | null;
  birthDate?: Date | null;
  maritalStatus?: string | null;
  phone?: string | null;
  additionalPhone?: string | null;
  personalEmail?: string | null;
  createdBy: string | null;
}

export interface UpdateEmployeeData {
  employeeNo?: string;
  fullNameAr?: string;
  fullNameEn?: string;
  nationalId?: string;
  nationality?: string;
  isSaudi?: boolean;
  jobTitle?: string | null;
  departmentId?: string | null;
  branchId?: string | null;
  scheduleId?: string | null;
  managerId?: string | null;
  hireDate?: Date;
  endDate?: Date | null;
  status?: EmployeeStatus;
  iban?: string | null;
  gender?: string | null;
  birthDate?: Date | null;
  maritalStatus?: string | null;
  phone?: string | null;
  additionalPhone?: string | null;
  personalEmail?: string | null;
  /** An HR-set IBAN supersedes anything the employee had submitted for review. */
  pendingIban?: string | null;
  ibanReviewStatus?: ReviewStatus | null;
  ibanReviewReason?: string | null;
}

/** Fields the employee edits about themselves, plus the IBAN review state machine
 * (docs/domain/business-rules.md "Employee onboarding"). Never reachable through
 * the HR update schema. */
export interface ProfileFieldsData {
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  additionalPhone?: string | null;
  iban?: string | null;
  pendingIban?: string | null;
  ibanReviewStatus?: ReviewStatus | null;
  ibanReviewReason?: string | null;
}

export interface EmployeesRepositoryPort {
  /** Employees inside `scope` (ADR-0011 §2) — there is deliberately no unscoped list. */
  list(companyId: string, scope: DataScope): Promise<Employee[]>;
  findById(companyId: string, id: string): Promise<Employee | null>;
  /** Only to decorate records the caller was already authorised for (names on a leave list), never as a list. */
  findByIds(companyId: string, ids: string[]): Promise<Employee[]>;
  findByUserIds(companyId: string, userIds: string[]): Promise<Employee[]>;
  create(companyId: string, data: CreateEmployeeData): Promise<Employee>;
  /**
   * The next automatic employee number (E-0001, E-0002, … after the highest E-number in use). Holds a per-company
   * lock until the transaction ends, so two employees created at once never get the same number.
   */
  nextEmployeeNo(companyId: string): Promise<string>;
  update(companyId: string, id: string, data: UpdateEmployeeData): Promise<Employee | null>;
  /** Like findById, but locks the row until the surrounding transaction ends, so concurrent saves of one
   * employee run one after the other. "no_key" (default) = FOR NO KEY UPDATE; "key" = FOR UPDATE, for a
   * transaction that will change a uniquely-indexed column (user_id, employee_no, national_id) or delete
   * the row — asked for up front so the lock is never upgraded midway. */
  findByIdForUpdate(companyId: string, id: string, mode?: EmployeeLockMode): Promise<Employee | null>;
  delete(companyId: string, id: string): Promise<boolean>;
  /** Never reachable through UpdateEmployeeSchema/the public PATCH endpoint —
   * only the invitation-accepted event listener calls this
   * (docs/adr/0007-invitations.md). Only links if userId is still null,
   * returning false otherwise; the listener treats that as a refusal and the
   * whole acceptance rolls back (docs/adr/0008). Call it under the "key" lock. */
  linkUser(companyId: string, employeeId: string, userId: string): Promise<boolean>;
  findByUserId(companyId: string, userId: string): Promise<Employee | null>;
  patchProfileFields(companyId: string, id: string, data: ProfileFieldsData): Promise<Employee | null>;
  /** Approve/reject transition, applied only if the employee is still awaiting review of exactly
   * `expectedPendingIban` (one atomic conditional write). Null = it changed or was already decided. */
  decideIban(companyId: string, id: string, expectedPendingIban: string, data: ProfileFieldsData): Promise<Employee | null>;
  /** Employees inside `scope` with an IBAN submission awaiting HR. */
  listPendingIban(companyId: string, scope: DataScope): Promise<Employee[]>;
}
