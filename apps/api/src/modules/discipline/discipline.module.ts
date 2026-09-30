import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { DISCIPLINE_REPOSITORY } from "./application/ports/discipline-repository.port";
import { ShortLeaveService } from "./application/shortleave.service";
import { WarningsService } from "./application/warnings.service";
import { DisciplineController } from "./http/discipline.controller";
import { PrismaDisciplineRepository } from "./infrastructure/prisma-discipline.repository";

/** Warnings and short permissions (Phase 6). Attendance excuses lateness via the "shortleave.approved" event. */
@Module({
  imports: [AuditModule, CompanyModule, EmployeesModule],
  controllers: [DisciplineController],
  providers: [WarningsService, ShortLeaveService, { provide: DISCIPLINE_REPOSITORY, useClass: PrismaDisciplineRepository }],
})
export class DisciplineModule {}
