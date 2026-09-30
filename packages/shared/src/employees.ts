import { z } from "zod";
import { isValidSaudiIban, normalizeIban } from "./iban.js";
import { DOCUMENT_TYPES, EMPLOYEE_STATUSES, SALARY_COMPONENT_TYPES } from "./enums.js";

/** Trimmed, spaces stripped, uppercased, then checked (pattern + ISO 13616 mod-97). */
export const IbanSchema = z
  .string()
  .transform(normalizeIban)
  .refine(isValidSaudiIban, { message: "invalid_iban" });

/** All request bodies are `.strict()` — unknown fields rejected (AGENTS.md §4 rule 5). */

export const CreateDepartmentSchema = z
  .object({
    name: z.string().min(1),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CreateDepartment = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().strict();
export type UpdateDepartment = z.infer<typeof UpdateDepartmentSchema>;

export const GENDERS = ["male", "female"] as const;
export const MARITAL_STATUSES = ["single", "married", "divorced", "widowed"] as const;
export const CONTACT_RELATIONSHIPS = ["father", "mother", "spouse", "sibling", "son", "daughter", "relative", "friend", "other"] as const;

/** Digits with an optional leading + and spaces/dashes (e.g. "+966 50 123 4567", "0501234567"). */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{6,18}[0-9]$/, "invalid_phone");

export const CreateEmployeeSchema = z
  .object({
    employeeNo: z.string().min(1),
    fullNameAr: z.string().min(1),
    fullNameEn: z.string().min(1),
    // Holds the national ID for Saudis or the Iqama number for non-Saudis
    // (docs/architecture/data-model.md "national_id / iqama_no"; isSaudi says which).
    nationalId: z.string().min(1),
    nationality: z.string().min(1),
    isSaudi: z.boolean(),
    jobTitle: z.string().min(1).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    scheduleId: z.string().uuid().nullable().optional(),
    managerId: z.string().uuid().nullable().optional(),
    hireDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
    status: z.enum(EMPLOYEE_STATUSES).default("active"),
    // Personal tier (ADR-0011 §3): writing these needs employees:read-sensitive.
    gender: z.enum(GENDERS).nullable().optional(),
    birthDate: z.string().date().nullable().optional(),
    maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
    phone: PhoneSchema.nullable().optional(),
    additionalPhone: PhoneSchema.nullable().optional(),
    personalEmail: z.string().trim().email().nullable().optional(),
    // HR entering an IBAN directly is trusted and applies immediately — only an
    // employee's own submission goes to review (docs/domain/business-rules.md).
    iban: IbanSchema.nullable().optional(),
  })
  .strict();
export type CreateEmployee = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial().strict();
export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;

export const CreateSalaryComponentSchema = z
  .object({
    type: z.enum(SALARY_COMPONENT_TYPES),
    // Halalas as a numeric string (AGENTS.md §3 rule 3: bigint end to end,
    // never a float) — a JSON number would be an IEEE-754 double at the
    // parse boundary, before Zod ever sees it. Matches the wire format the
    // BigInt.prototype.toJSON patch already produces on the way out.
    amountHalalas: z.string().regex(/^\d+$/, "amountHalalas must be a non-negative integer string"),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable().optional(),
  })
  .strict();
export type CreateSalaryComponent = z.infer<typeof CreateSalaryComponentSchema>;

export const UpdateSalaryComponentSchema = CreateSalaryComponentSchema.partial().strict();
export type UpdateSalaryComponent = z.infer<typeof UpdateSalaryComponentSchema>;

/** Metadata only — the file itself arrives as multipart, validated separately
 * in the controller (docs/adr/0005-file-storage-local-disk.md). */
export const CreateEmployeeDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    number: z.string().min(1),
    issueDate: z.string().date().nullable().optional(),
    expiryDate: z.string().date().nullable().optional(),
  })
  .strict();
export type CreateEmployeeDocument = z.infer<typeof CreateEmployeeDocumentSchema>;

export const UpdateEmployeeDocumentSchema = CreateEmployeeDocumentSchema.partial().strict();
export type UpdateEmployeeDocument = z.infer<typeof UpdateEmployeeDocumentSchema>;

/** POST /api/v1/employees/:id/invite (docs/adr/0007-invitations.md). */
export const InviteEmployeeSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();
export type InviteEmployee = z.infer<typeof InviteEmployeeSchema>;

/** PATCH /api/v1/me/profile — contact fields only, applied immediately, no review.
 * HR-owned fields are deliberately absent (.strict() rejects them). */
export const MyProfileUpdateSchema = z
  .object({
    phone: PhoneSchema.nullable().optional(),
    additionalPhone: PhoneSchema.nullable().optional(),
    personalEmail: z.string().trim().email().nullable().optional(),
    address: z.string().min(1).max(300).nullable().optional(),
  })
  .strict();
export type MyProfileUpdate = z.infer<typeof MyProfileUpdateSchema>;

/** POST /api/v1/me/iban — goes to pending_review. */
export const SubmitIbanSchema = z.object({ iban: IbanSchema }).strict();
export type SubmitIban = z.infer<typeof SubmitIbanSchema>;

/** Body of every reject endpoint — a reason is mandatory, the employee sees it. */
export const RejectReviewSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export type RejectReview = z.infer<typeof RejectReviewSchema>;

/** IBAN decisions name the exact value the reviewer saw, so a resubmission in between can't be approved unseen. */
const ExpectedIbanSchema = z.string().min(1).max(40);
export const ApproveIbanSchema = z.object({ expectedIban: ExpectedIbanSchema }).strict();
export type ApproveIban = z.infer<typeof ApproveIbanSchema>;
export const RejectIbanSchema = z.object({ expectedIban: ExpectedIbanSchema, reason: RejectReviewSchema.shape.reason }).strict();
export type RejectIban = z.infer<typeof RejectIbanSchema>;

/** GET /documents/expiring — approved documents of active employees expiring within `days` (or already expired). */
export const ExpiringDocumentsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(60) }).strict();
export type ExpiringDocumentsQuery = z.infer<typeof ExpiringDocumentsQuerySchema>;

/** The fields an assignment (career history row, ADR-0012) tracks. */
export const ASSIGNMENT_FIELDS = ["branchId", "departmentId", "jobTitle", "managerId", "scheduleId"] as const;
export type AssignmentField = (typeof ASSIGNMENT_FIELDS)[number];

export type AssignmentKind = "hire" | "transfer" | "change";

/** GET /api/v1/employees/:id/assignments — newest first; `scheduled` rows are not applied yet. */
export interface AssignmentView {
  id: string;
  kind: AssignmentKind;
  branchId: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  scheduleId: string | null;
  validFrom: string;
  validTo: string | null;
  scheduled: boolean;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Relatives and trusted people (POST/PATCH /employees/:id/contacts and /me/contacts). */
export const ContactSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    relationship: z.enum(CONTACT_RELATIONSHIPS),
    phone: PhoneSchema,
    isEmergency: z.boolean().default(false),
  })
  .strict();
export type ContactInput = z.infer<typeof ContactSchema>;
export const UpdateContactSchema = ContactSchema.partial().strict();
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const CONTRACT_TYPES = ["fixed_term", "open_ended"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

/** POST /employees/:id/contracts and POST /contracts/:id/renew. probationEndDate omitted = the company default (90 days). */
export const CreateContractSchema = z
  .object({
    type: z.enum(CONTRACT_TYPES),
    startDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
    probationEndDate: z.string().date().nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((c) => c.type === "open_ended" || Boolean(c.endDate), { message: "end_date_required", path: ["endDate"] })
  .refine((c) => !c.endDate || c.endDate >= c.startDate, { message: "invalid_dates", path: ["endDate"] })
  .refine((c) => !c.probationEndDate || c.probationEndDate >= c.startDate, { message: "invalid_dates", path: ["probationEndDate"] });
export type CreateContract = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = z
  .object({
    endDate: z.string().date().nullable().optional(),
    probationEndDate: z.string().date().nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type UpdateContract = z.infer<typeof UpdateContractSchema>;

export const EndContractSchema = z.object({ endDate: z.string().date(), notes: z.string().trim().max(500).optional() }).strict();
export type EndContract = z.infer<typeof EndContractSchema>;

export interface ContractView {
  id: string;
  employeeId: string;
  type: ContractType;
  startDate: string;
  endDate: string | null;
  probationEndDate: string | null;
  status: "active" | "renewed" | "ended";
  renewedFromId: string | null;
  notes: string | null;
  createdAt: string;
}

export const InsurancePolicySchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    policyNumber: z.string().trim().min(1).max(60),
    startDate: z.string().date(),
    endDate: z.string().date(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((p) => p.endDate >= p.startDate, { message: "invalid_dates", path: ["endDate"] });
export type InsurancePolicyInput = z.infer<typeof InsurancePolicySchema>;

export const EnrolmentSchema = z
  .object({
    policyId: z.string().uuid(),
    class: z.string().trim().min(1).max(30),
    memberNumber: z.string().trim().max(60).nullable().optional(),
    startDate: z.string().date(),
    endDate: z.string().date().nullable().optional(),
  })
  .strict()
  .refine((e) => !e.endDate || e.endDate >= e.startDate, { message: "invalid_dates", path: ["endDate"] });
export type EnrolmentInput = z.infer<typeof EnrolmentSchema>;

export interface InsurancePolicyView {
  id: string;
  provider: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  members: number;
}

export interface EnrolmentView {
  id: string;
  employeeId: string;
  policyId: string;
  provider: string;
  policyNumber: string;
  class: string;
  memberNumber: string | null;
  startDate: string;
  /** The enrolment's own end, else the policy's. */
  endDate: string | null;
  policyEndDate: string;
}

export interface ContactView {
  id: string;
  name: string;
  relationship: (typeof CONTACT_RELATIONSHIPS)[number];
  phone: string;
  isEmergency: boolean;
}
