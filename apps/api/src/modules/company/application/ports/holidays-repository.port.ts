import type { Holiday } from "@prisma/client";

export const HOLIDAYS_REPOSITORY = Symbol("HOLIDAYS_REPOSITORY");

export interface CreateHolidayData {
  date: Date;
  name: string;
  paid: boolean;
  createdBy: string | null;
}

export interface UpdateHolidayData {
  date?: Date;
  name?: string;
  paid?: boolean;
}

export interface HolidaysRepositoryPort {
  list(companyId: string): Promise<Holiday[]>;
  findById(companyId: string, id: string): Promise<Holiday | null>;
  create(companyId: string, data: CreateHolidayData): Promise<Holiday>;
  update(companyId: string, id: string, data: UpdateHolidayData): Promise<Holiday | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
