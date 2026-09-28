import { z } from "zod";
import { CUSTODY_STATUSES } from "./enums.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
/** Money crosses the API as a string of integer halalas (bigint-safe, AGENTS.md §3 rule 3). */
const HALALAS = z.string().regex(/^[1-9]\d{0,14}$/, "Expected a positive whole number of halalas");


export const CreateCustodyRequestSchema = z
  .object({ amountHalalas: HALALAS, purpose: z.string().trim().min(3).max(500) })
  .strict();
export type CreateCustodyRequest = z.infer<typeof CreateCustodyRequestSchema>;

export const ApproveCustodySchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
export type ApproveCustody = z.infer<typeof ApproveCustodySchema>;

export const RejectCustodySchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();
export type RejectCustody = z.infer<typeof RejectCustodySchema>;

/** Accountant marks it paid after recording the payment in Techno Link. */
export const PayCustodySchema = z.object({ technoLinkRef: z.string().trim().min(1).max(100) }).strict();
export type PayCustody = z.infer<typeof PayCustodySchema>;

/** Returned or justified; the settled amount may be less than what was paid (never more). */
export const SettleCustodySchema = z
  .object({ settledAmountHalalas: z.string().regex(/^\d{1,15}$/, "Expected a whole number of halalas"), note: z.string().trim().max(500).optional() })
  .strict();
export type SettleCustody = z.infer<typeof SettleCustodySchema>;

export const CustodyRequestsQuerySchema = z
  .object({ status: z.enum(CUSTODY_STATUSES).optional(), employeeId: z.string().uuid().optional() })
  .strict();
export type CustodyRequestsQuery = z.infer<typeof CustodyRequestsQuerySchema>;

export const CustodyExportQuerySchema = z
  .object({ from: DATE, to: DATE })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] });
export type CustodyExportQuery = z.infer<typeof CustodyExportQuerySchema>;
