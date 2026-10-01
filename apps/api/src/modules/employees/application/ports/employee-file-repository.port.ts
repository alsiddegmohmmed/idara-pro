import type { Contract, EmployeeContact, EmployeeInsurance, InsurancePolicy } from "@prisma/client";
import type { DataScope } from "../../../../shared/access/access-rules";

export const EMPLOYEE_FILE_REPOSITORY = Symbol("EMPLOYEE_FILE_REPOSITORY");

export type EnrolmentWithPolicy = EmployeeInsurance & { policy: InsurancePolicy };

export interface ContactData {
  name: string;
  relationship: string;
  phone: string;
  isEmergency: boolean;
}

export interface ContractData {
  type: string;
  startDate: Date;
  endDate: Date | null;
  probationEndDate: Date | null;
  notes: string | null;
  renewedFromId: string | null;
}

export type ExpiryKind = "contract_end" | "probation_end" | "insurance_end";

export interface ExpiryCandidate {
  kind: ExpiryKind;
  /** The contract or enrolment id (the dedup key with kind + threshold). */
  entityId: string;
  date: Date;
  employee: { id: string; fullNameAr: string; fullNameEn: string; userId: string | null; branchId: string | null; managerId: string | null };
}

/** Employee file (Phase 5): relatives/contacts, contracts, insurance. Writes join the caller's transaction. */
export interface EmployeeFileRepositoryPort {
  listContacts(companyId: string, employeeId: string): Promise<EmployeeContact[]>;
  findContact(companyId: string, id: string): Promise<EmployeeContact | null>;
  createContact(companyId: string, employeeId: string, data: ContactData, createdBy: string): Promise<EmployeeContact>;
  updateContact(companyId: string, id: string, data: Partial<ContactData>): Promise<EmployeeContact>;
  deleteContact(companyId: string, id: string): Promise<void>;
  /** Only one emergency contact per employee: clears the flag on the others. */
  clearEmergency(companyId: string, employeeId: string, exceptId: string): Promise<void>;

  listContracts(companyId: string, employeeId: string): Promise<Contract[]>;
  /** Active contracts of active, in-scope employees whose end or probation end is within [from, to]. */
  listContractsEnding(companyId: string, scope: DataScope, from: Date, to: Date): Promise<Array<Contract & { employee: { id: string; fullNameAr: string; fullNameEn: string } }>>;
  findContract(companyId: string, id: string): Promise<Contract | null>;
  findActiveContract(companyId: string, employeeId: string): Promise<Contract | null>;
  createContract(companyId: string, employeeId: string, data: ContractData, createdBy: string): Promise<Contract>;
  updateContract(companyId: string, id: string, data: Partial<ContractData> & { status?: string }): Promise<Contract>;

  listPolicies(companyId: string): Promise<Array<InsurancePolicy & { _count: { members: number } }>>;
  findPolicy(companyId: string, id: string): Promise<InsurancePolicy | null>;
  createPolicy(companyId: string, data: Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt">): Promise<InsurancePolicy>;
  updatePolicy(companyId: string, id: string, data: Partial<Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt" | "createdBy">>): Promise<InsurancePolicy>;
  listEnrolments(companyId: string, employeeId: string): Promise<EnrolmentWithPolicy[]>;
  findEnrolment(companyId: string, id: string): Promise<EnrolmentWithPolicy | null>;
  createEnrolment(
    companyId: string,
    data: Omit<EmployeeInsurance, "id" | "companyId" | "createdAt" | "updatedAt">,
  ): Promise<EnrolmentWithPolicy>;
  updateEnrolment(companyId: string, id: string, data: Partial<Omit<EmployeeInsurance, "id" | "companyId" | "employeeId" | "createdAt" | "updatedAt" | "createdBy">>): Promise<EnrolmentWithPolicy>;
  deleteEnrolment(companyId: string, id: string): Promise<void>;

  /** Active employees' contract ends, probation ends and insurance ends falling in [since, until]. */
  expiryCandidates(companyId: string, since: Date, until: Date): Promise<ExpiryCandidate[]>;
  notifiedThresholds(companyId: string, kind: ExpiryKind, entityIds: string[]): Promise<Map<string, Set<number>>>;
  /** Idempotent (unique kind + entity + threshold). */
  recordNotices(companyId: string, rows: Array<{ kind: ExpiryKind; entityId: string; thresholdDays: number }>): Promise<void>;
}
