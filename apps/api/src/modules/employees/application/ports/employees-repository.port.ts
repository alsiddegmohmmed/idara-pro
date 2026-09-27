import type { Employee, EmployeeStatus } from "@prisma/client";

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
}

export interface EmployeesRepositoryPort {
  list(companyId: string): Promise<Employee[]>;
  findById(companyId: string, id: string): Promise<Employee | null>;
  create(companyId: string, data: CreateEmployeeData): Promise<Employee>;
  update(companyId: string, id: string, data: UpdateEmployeeData): Promise<Employee | null>;
  delete(companyId: string, id: string): Promise<boolean>;
  /** Never reachable through UpdateEmployeeSchema/the public PATCH endpoint —
   * only the invitation-accepted event listener calls this
   * (docs/adr/0007-invitations.md). Only links if userId is still null,
   * returning false otherwise so the caller can tell a stale second
   * acceptance apart from a real failure. */
  linkUser(companyId: string, employeeId: string, userId: string): Promise<boolean>;
}
