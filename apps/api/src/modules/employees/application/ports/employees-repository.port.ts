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
}
