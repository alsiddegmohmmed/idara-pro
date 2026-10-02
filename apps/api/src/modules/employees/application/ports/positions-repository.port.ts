import type { Position } from "@prisma/client";

export const POSITIONS_REPOSITORY = Symbol("POSITIONS_REPOSITORY");

export interface PositionData {
  nameAr: string;
  nameEn?: string | null;
  departmentId?: string | null;
  occupationCode?: string | null;
}

export interface PositionsRepositoryPort {
  /** With how many employees hold each one. */
  list(companyId: string): Promise<Array<Position & { employees: number }>>;
  findById(companyId: string, id: string): Promise<Position | null>;
  findByNameAr(companyId: string, nameAr: string): Promise<Position | null>;
  create(companyId: string, data: PositionData & { createdBy: string | null }): Promise<Position>;
  update(companyId: string, id: string, data: Partial<PositionData>): Promise<Position | null>;
  /** Also refreshes the job-title snapshot of everyone holding it. */
  renameSnapshots(companyId: string, positionId: string, nameAr: string): Promise<void>;
  delete(companyId: string, id: string): Promise<boolean>;
}
