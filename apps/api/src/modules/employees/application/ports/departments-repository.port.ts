import type { Department } from "@prisma/client";

export const DEPARTMENTS_REPOSITORY = Symbol("DEPARTMENTS_REPOSITORY");

export interface CreateDepartmentData {
  name: string;
  parentId?: string | null;
  createdBy: string | null;
}

export interface UpdateDepartmentData {
  name?: string;
  parentId?: string | null;
}

export interface DepartmentsRepositoryPort {
  list(companyId: string): Promise<Department[]>;
  findById(companyId: string, id: string): Promise<Department | null>;
  create(companyId: string, data: CreateDepartmentData): Promise<Department>;
  update(companyId: string, id: string, data: UpdateDepartmentData): Promise<Department | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
