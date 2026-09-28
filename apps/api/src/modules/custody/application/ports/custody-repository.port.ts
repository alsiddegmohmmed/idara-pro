import type { CustodyRequest, CustodyStatus, Prisma } from "@prisma/client";

export const CUSTODY_REPOSITORY = Symbol("CUSTODY_REPOSITORY");

export interface CustodyRepositoryPort {
  create(companyId: string, data: { employeeId: string; amountHalalas: bigint; purpose: string; createdBy: string }): Promise<CustodyRequest>;
  lockById(companyId: string, id: string): Promise<CustodyRequest | null>;
  update(companyId: string, id: string, data: Prisma.CustodyRequestUncheckedUpdateManyInput): Promise<CustodyRequest>;
  list(companyId: string, filter: { employeeIds?: string[]; status?: CustodyStatus }): Promise<CustodyRequest[]>;
  listPaidBetween(companyId: string, from: Date, to: Date): Promise<CustodyRequest[]>;
}
