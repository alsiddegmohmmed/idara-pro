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
  originalFilename: string;
  sizeBytes: number;
  checksumSha256: string;
  createdBy: string | null;
}

export interface UpdateEmployeeDocumentData {
  type?: DocumentType;
  number?: string;
  issueDate?: Date | null;
  expiryDate?: Date | null;
}

/** One row this repository hands the expiry-check use case (docs/adr/0006):
 * enough of the document + its owning employee + its notice history to decide
 * what, if anything, needs notifying — without a second round trip per document. */
export interface ExpiringDocumentCandidate {
  id: string;
  type: DocumentType;
  expiryDate: Date;
  employee: {
    id: string;
    fullNameAr: string;
    fullNameEn: string;
    userId: string | null;
  };
  notifiedThresholds: number[];
}

export interface EmployeeDocumentsRepositoryPort {
  listByEmployee(companyId: string, employeeId: string): Promise<EmployeeDocument[]>;
  findById(companyId: string, id: string): Promise<EmployeeDocument | null>;
  create(companyId: string, data: CreateEmployeeDocumentData): Promise<EmployeeDocument>;
  update(companyId: string, id: string, data: UpdateEmployeeDocumentData): Promise<EmployeeDocument | null>;
  delete(companyId: string, id: string): Promise<boolean>;
  /** Documents with an expiryDate, belonging to active employees. */
  listExpiringCandidates(companyId: string): Promise<ExpiringDocumentCandidate[]>;
  /** Idempotency record (docs/adr/0006) — returns false if already recorded
   * (unique violation), so the caller knows not to re-emit the event. */
  recordExpiryNotice(companyId: string, documentId: string, thresholdDays: number): Promise<boolean>;
}
