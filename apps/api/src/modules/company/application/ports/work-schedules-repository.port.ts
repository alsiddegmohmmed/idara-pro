import type { WorkSchedule } from "@prisma/client";

export const WORK_SCHEDULES_REPOSITORY = Symbol("WORK_SCHEDULES_REPOSITORY");

export interface CreateWorkScheduleData {
  name: string;
  startTime: string;
  endTime: string;
  lateGraceMin: number;
  workDays: number[];
  createdBy: string | null;
}

export interface UpdateWorkScheduleData {
  name?: string;
  startTime?: string;
  endTime?: string;
  lateGraceMin?: number;
  workDays?: number[];
}

export interface WorkSchedulesRepositoryPort {
  list(companyId: string): Promise<WorkSchedule[]>;
  findById(companyId: string, id: string): Promise<WorkSchedule | null>;
  create(companyId: string, data: CreateWorkScheduleData): Promise<WorkSchedule>;
  update(companyId: string, id: string, data: UpdateWorkScheduleData): Promise<WorkSchedule | null>;
  delete(companyId: string, id: string): Promise<boolean>;
}
