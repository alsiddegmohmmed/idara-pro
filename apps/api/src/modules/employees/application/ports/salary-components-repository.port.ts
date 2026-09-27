import type { SalaryComponent, SalaryComponentType } from "@prisma/client";

export const SALARY_COMPONENTS_REPOSITORY = Symbol("SALARY_COMPONENTS_REPOSITORY");

export interface CreateSalaryComponentData {
  employeeId: string;
  type: SalaryComponentType;
  amountHalalas: bigint;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  createdBy: string | null;
}

export interface UpdateSalaryComponentData {
  type?: SalaryComponentType;
  amountHalalas?: bigint;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}

export interface SalaryComponentsRepositoryPort {
  listByEmployee(companyId: string, employeeId: string): Promise<SalaryComponent[]>;
  listByEmployeeAndType(
    companyId: string,
    employeeId: string,
    type: SalaryComponentType,
  ): Promise<SalaryComponent[]>;
  findById(companyId: string, id: string): Promise<SalaryComponent | null>;
  create(companyId: string, data: CreateSalaryComponentData): Promise<SalaryComponent>;
  update(companyId: string, id: string, data: UpdateSalaryComponentData): Promise<SalaryComponent | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
