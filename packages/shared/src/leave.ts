import { z } from "zod";
import { LEAVE_REQUEST_STATUSES } from "./enums.js";

/** All request bodies/queries are `.strict()` — unknown fields rejected (AGENTS.md §4 rule 5). */

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");


export const CreateLeaveRequestSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: DATE,
    endDate: DATE,
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((r) => r.startDate <= r.endDate, { message: "startDate must not be after endDate", path: ["endDate"] });
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const LeavePreviewQuerySchema = z
  .object({ leaveTypeId: z.string().uuid(), startDate: DATE, endDate: DATE })
  .strict()
  .refine((r) => r.startDate <= r.endDate, { message: "startDate must not be after endDate", path: ["endDate"] });
export type LeavePreviewQuery = z.infer<typeof LeavePreviewQuerySchema>;

export const ApproveLeaveSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
export type ApproveLeave = z.infer<typeof ApproveLeaveSchema>;

/** A rejection always says why — the employee sees it. */
export const RejectLeaveSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();
export type RejectLeave = z.infer<typeof RejectLeaveSchema>;

export const LeaveRequestsQuerySchema = z
  .object({
    status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
    from: DATE.optional(),
    to: DATE.optional(),
    employeeId: z.string().uuid().optional(),
  })
  .strict();
export type LeaveRequestsQuery = z.infer<typeof LeaveRequestsQuerySchema>;

export const YearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }).strict();
export type YearQuery = z.infer<typeof YearQuerySchema>;

/** GET /leave/balances: one year, optionally one employee (a record or a review panel needs just theirs). */
export const LeaveBalancesQuerySchema = z
  .object({ year: z.coerce.number().int().min(2000).max(2100).optional(), employeeId: z.string().uuid().optional() })
  .strict();
export type LeaveBalancesQuery = z.infer<typeof LeaveBalancesQuerySchema>;

/** HR adjusts one employee's yearly entitlement (e.g. 30 days after 5 years), with a reason for the audit log. */
export const SetLeaveEntitlementSchema = z
  .object({
    employeeId: z.string().uuid(),
    leaveTypeId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    entitledDays: z.number().int().min(0).max(366),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type SetLeaveEntitlement = z.infer<typeof SetLeaveEntitlementSchema>;

/** One pay tier: the next `days` days of this leave type in a year are paid at `percent`. */
export const PayTierSchema = z.object({ days: z.number().int().min(1).max(366), percent: z.number().int().min(0).max(100) }).strict();
export type PayTier = z.infer<typeof PayTierSchema>;

/** PATCH /api/v1/leave/types/:id — leave:manage. Whether a type deducts a balance is fixed once created. */
export const UpdateLeaveTypeSchema = z
  .object({
    nameAr: z.string().trim().min(2).max(100).optional(),
    nameEn: z.string().trim().min(2).max(100).optional(),
    defaultDays: z.number().int().min(0).max(366).optional(),
    payTiers: z.array(PayTierSchema).min(1).max(6).nullable().optional(),
    requiresAttachment: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateLeaveType = z.infer<typeof UpdateLeaveTypeSchema>;
