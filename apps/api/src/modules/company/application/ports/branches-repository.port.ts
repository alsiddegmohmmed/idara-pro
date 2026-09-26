import type { Branch } from "@prisma/client";

export const BRANCHES_REPOSITORY = Symbol("BRANCHES_REPOSITORY");

export interface CreateBranchData {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  defaultScheduleId?: string | null;
  technoLinkBranchCode?: string | null;
  createdBy: string | null;
}

export interface UpdateBranchData {
  name?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  defaultScheduleId?: string | null;
  technoLinkBranchCode?: string | null;
}

export interface BranchesRepositoryPort {
  list(companyId: string): Promise<Branch[]>;
  findById(companyId: string, id: string): Promise<Branch | null>;
  create(companyId: string, data: CreateBranchData): Promise<Branch>;
  /** Returns null when no row matches (id, companyId) — tenant-safe no-op, not an error. */
  update(companyId: string, id: string, data: UpdateBranchData): Promise<Branch | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
