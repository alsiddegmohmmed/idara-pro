import type { DataScope } from "../../../../shared/access/access-rules";
import type { CustodyRequest, CustodyStatus, Prisma } from "@prisma/client";

export const CUSTODY_REPOSITORY = Symbol("CUSTODY_REPOSITORY");

export interface CustodyRepositoryPort {
  create(companyId: string, data: { employeeId: string; branchId: string | null; amountHalalas: bigint; purpose: string; createdBy: string }): Promise<CustodyRequest>;
  lockById(companyId: string, id: string): Promise<CustodyRequest | null>;
  update(companyId: string, id: string, data: Prisma.CustodyRequestUncheckedUpdateManyInput): Promise<CustodyRequest>;
  /** `scope` filters by each request's own branch snapshot (ADR-0012). */
  list(companyId: string, filter: { employeeIds?: string[]; scope?: DataScope; status?: CustodyStatus }): Promise<CustodyRequest[]>;
  listPaidBetween(companyId: string, from: Date, to: Date): Promise<CustodyRequest[]>;
}
