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
    phone: z.string().min(1).max(30).nullable().optional(),
    personalEmail: z.string().email().nullable().optional(),
    address: z.string().min(1).max(300).nullable().optional(),
    emergencyContactName: z.string().min(1).max(100).nullable().optional(),
    emergencyContactPhone: z.string().min(1).max(30).nullable().optional(),
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

/**
 * POST /api/v1/employees/:id/transfers — a transfer, promotion or manager change with an effective date.
 * Today or earlier applies at once; a future date is scheduled and applied by the nightly job.
 * Omitted fields keep their current value; null clears one.
 */
export const TransferEmployeeSchema = z
  .object({
    effectiveDate: z.string().date(),
    branchId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    jobTitle: z.string().trim().min(1).nullable().optional(),
    managerId: z.string().uuid().nullable().optional(),
    scheduleId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((t) => ASSIGNMENT_FIELDS.some((f) => t[f] !== undefined), { message: "nothing_to_change" });
export type TransferEmployee = z.infer<typeof TransferEmployeeSchema>;

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
