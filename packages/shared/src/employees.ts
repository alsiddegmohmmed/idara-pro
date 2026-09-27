import { z } from "zod";
import { DOCUMENT_TYPES, EMPLOYEE_STATUSES, SALARY_COMPONENT_TYPES } from "./enums.js";

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
  })
  .strict();
export type CreateEmployee = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial().strict();
export type UpdateEmployee = z.infer<typeof UpdateEmployeeSchema>;

export const CreateSalaryComponentSchema = z
  .object({
    type: z.enum(SALARY_COMPONENT_TYPES),
    // Integer halalas (AGENTS.md §3 rule 3) — never a float.
    amountHalalas: z.number().int().nonnegative(),
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
