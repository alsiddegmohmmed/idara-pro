import { z } from "zod";
import { EMPLOYEE_STATUSES } from "./enums.js";

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
