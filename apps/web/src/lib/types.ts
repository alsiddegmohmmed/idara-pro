// Response shapes of apps/api, only the fields the UI reads.

export type ReviewStatus = "pending_review" | "approved" | "rejected";

export interface Employee {
  id: string;
  employeeNo: string;
  fullNameAr: string;
  fullNameEn: string;
  nationalId: string;
  nationality: string;
  isSaudi: boolean;
  jobTitle: string | null;
  positionId: string | null;
  departmentId: string | null;
  branchId: string | null;
  scheduleId: string | null;
  managerId: string | null;
  hireDate: string;
  endDate: string | null;
  status: "active" | "inactive";
  userId: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  additionalPhone: string | null;
  gender: "male" | "female" | null;
  birthDate: string | null;
  maritalStatus: "single" | "married" | "divorced" | "widowed" | null;
  iban: string | null;
  pendingIban: string | null;
  ibanReviewStatus: ReviewStatus | null;
  ibanReviewReason: string | null;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface SalaryComponent {
  id: string;
  type: "basic" | "housing" | "transport" | "other";
  amountHalalas: string; // bigint serialized as a string
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: "iqama" | "passport" | "national_id" | "contract" | "other";
  number: string;
  issueDate: string | null;
  expiryDate: string | null;
  originalFilename: string;
  reviewStatus: ReviewStatus;
  reviewReason: string | null;
  createdAt: string;
}

export interface ReviewQueue {
  ibans: Array<{
    employeeId: string;
    employeeNo: string;
    fullNameAr: string;
    fullNameEn: string;
    currentIbanLast4: string | null;
    pendingIban: string;
    submittedAt: string;
    isOwn: boolean;
  }>;
  documents: Array<EmployeeDocument & { isOwn: boolean; employee: { id: string; fullNameAr: string; fullNameEn: string } }>;
}

export interface AppNotification {
  id: string;
  type: string;
  titleKey: string;
  bodyParams: Record<string, unknown>;
  entity: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
}
