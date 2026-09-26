import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { BranchesService } from "./application/branches.service";
import { HolidaysService } from "./application/holidays.service";
import { WorkSchedulesService } from "./application/work-schedules.service";
import { BRANCHES_REPOSITORY } from "./application/ports/branches-repository.port";
import { HOLIDAYS_REPOSITORY } from "./application/ports/holidays-repository.port";
import { WORK_SCHEDULES_REPOSITORY } from "./application/ports/work-schedules-repository.port";
import { PrismaBranchesRepository } from "./infrastructure/prisma-branches.repository";
import { PrismaHolidaysRepository } from "./infrastructure/prisma-holidays.repository";
import { PrismaWorkSchedulesRepository } from "./infrastructure/prisma-work-schedules.repository";
import { BranchesController } from "./http/branches.controller";
import { HolidaysController } from "./http/holidays.controller";
import { WorkSchedulesController } from "./http/work-schedules.controller";

@Module({
  imports: [AuditModule],
  controllers: [BranchesController, WorkSchedulesController, HolidaysController],
  providers: [
    BranchesService,
    WorkSchedulesService,
    HolidaysService,
    { provide: BRANCHES_REPOSITORY, useClass: PrismaBranchesRepository },
    { provide: WORK_SCHEDULES_REPOSITORY, useClass: PrismaWorkSchedulesRepository },
    { provide: HOLIDAYS_REPOSITORY, useClass: PrismaHolidaysRepository },
  ],
  // BranchesService/WorkSchedulesService exported for other modules to verify
  // a referenced branch/schedule belongs to the caller's company (their
  // existing findById() already scopes by companyId — see employees module).
  exports: [BranchesService, WorkSchedulesService],
})
export class CompanyModule {}
