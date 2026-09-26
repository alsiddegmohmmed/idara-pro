import { z } from "zod";

/** All request bodies are `.strict()` — unknown fields rejected (AGENTS.md §4 rule 5). */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:mm", 24-hour

export const CreateBranchSchema = z
  .object({
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusM: z.number().int().positive(),
    defaultScheduleId: z.string().uuid().nullable().optional(),
    technoLinkBranchCode: z.string().min(1).nullable().optional(),
  })
  .strict();
export type CreateBranch = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = CreateBranchSchema.partial().strict();
export type UpdateBranch = z.infer<typeof UpdateBranchSchema>;

export const CreateWorkScheduleSchema = z
  .object({
    name: z.string().min(1),
    startTime: z.string().regex(TIME_PATTERN, "Expected HH:mm"),
    endTime: z.string().regex(TIME_PATTERN, "Expected HH:mm"),
    lateGraceMin: z.number().int().min(0),
    // 0-6, matching Company.weekendDays' existing JS Date.getDay() convention (0 = Sunday).
    workDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((days) => new Set(days).size === days.length, "workDays must not contain duplicates"),
  })
  .strict();
export type CreateWorkSchedule = z.infer<typeof CreateWorkScheduleSchema>;

export const UpdateWorkScheduleSchema = CreateWorkScheduleSchema.partial().strict();
export type UpdateWorkSchedule = z.infer<typeof UpdateWorkScheduleSchema>;

export const CreateHolidaySchema = z
  .object({
    date: z.string().date(),
    name: z.string().min(1),
    paid: z.boolean(),
  })
  .strict();
export type CreateHoliday = z.infer<typeof CreateHolidaySchema>;

export const UpdateHolidaySchema = CreateHolidaySchema.partial().strict();
export type UpdateHoliday = z.infer<typeof UpdateHolidaySchema>;
