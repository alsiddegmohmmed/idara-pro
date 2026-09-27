import type { DocumentType, EmployeeDocument } from "@prisma/client";

export const EMPLOYEE_DOCUMENTS_REPOSITORY = Symbol("EMPLOYEE_DOCUMENTS_REPOSITORY");

export interface CreateEmployeeDocumentData {
  employeeId: string;
  type: DocumentType;
  number: string;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  fileKey: string;
  contentType: string;
  createdBy: string | null;
}

export interface UpdateEmployeeDocumentData {
  type?: DocumentType;
  number?: string;
  issueDate?: Date | null;
  expiryDate?: Date | null;
}

export interface EmployeeDocumentsRepositoryPort {
  listByEmployee(companyId: string, employeeId: string): Promise<EmployeeDocument[]>;
  findById(companyId: string, id: string): Promise<EmployeeDocument | null>;
  create(companyId: string, data: CreateEmployeeDocumentData): Promise<EmployeeDocument>;
  update(companyId: string, id: string, data: UpdateEmployeeDocumentData): Promise<EmployeeDocument | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
