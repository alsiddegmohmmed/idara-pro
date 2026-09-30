import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { AdjustmentsService } from "./application/adjustments.service";
import { ADJUSTMENTS_REPOSITORY } from "./application/ports/adjustments-repository.port";
import { AdjustmentsController } from "./http/adjustments.controller";
import { PrismaAdjustmentsRepository } from "./infrastructure/prisma-adjustments.repository";

/** Payroll (Phase 7 builds the runs); for now: pay adjustments — deductions, bonuses, allowances. */
@Module({
  imports: [AuditModule, CompanyModule, EmployeesModule],
  controllers: [AdjustmentsController],
  providers: [AdjustmentsService, { provide: ADJUSTMENTS_REPOSITORY, useClass: PrismaAdjustmentsRepository }],
})
export class PayrollModule {}
