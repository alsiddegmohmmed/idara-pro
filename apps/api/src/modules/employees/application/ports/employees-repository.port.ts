import type { Employee, EmployeeStatus, ReviewStatus } from "@prisma/client";

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
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  iban?: string | null;
  pendingIban?: string | null;
  ibanReviewStatus?: ReviewStatus | null;
  ibanReviewReason?: string | null;
}

export interface EmployeesRepositoryPort {
  list(companyId: string): Promise<Employee[]>;
  findById(companyId: string, id: string): Promise<Employee | null>;
  create(companyId: string, data: CreateEmployeeData): Promise<Employee>;
  update(companyId: string, id: string, data: UpdateEmployeeData): Promise<Employee | null>;
  /** Like findById, but locks the row until the surrounding transaction ends (SELECT ... FOR NO KEY UPDATE),
   * so concurrent saves of one employee run one after the other. */
  findByIdForUpdate(companyId: string, id: string): Promise<Employee | null>;
  delete(companyId: string, id: string): Promise<boolean>;
  /** Never reachable through UpdateEmployeeSchema/the public PATCH endpoint —
   * only the invitation-accepted event listener calls this
   * (docs/adr/0007-invitations.md). Only links if userId is still null,
   * returning false otherwise so the caller can tell a stale second
   * acceptance apart from a real failure. */
  linkUser(companyId: string, employeeId: string, userId: string): Promise<boolean>;
  findByUserId(companyId: string, userId: string): Promise<Employee | null>;
  patchProfileFields(companyId: string, id: string, data: ProfileFieldsData): Promise<Employee | null>;
  /** Approve/reject transition, applied only if the employee is still awaiting review of exactly
   * `expectedPendingIban` (one atomic conditional write). Null = it changed or was already decided. */
  decideIban(companyId: string, id: string, expectedPendingIban: string, data: ProfileFieldsData): Promise<Employee | null>;
  /** Employees with an IBAN submission awaiting HR. */
  listPendingIban(companyId: string): Promise<Employee[]>;
}
