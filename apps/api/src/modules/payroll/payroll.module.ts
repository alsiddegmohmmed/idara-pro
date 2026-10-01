import { Module } from "@nestjs/common";
import { AttendanceModule } from "../attendance";
import { AuditModule } from "../audit";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { LeaveModule } from "../leave";
import { IdempotencyService } from "../../shared/idempotency/idempotency.service";
import { AdjustmentsService } from "./application/adjustments.service";
import { ADJUSTMENTS_REPOSITORY } from "./application/ports/adjustments-repository.port";
import { PayrollRunsService } from "./application/payroll-runs.service";
import { PAYROLL_RUNS_REPOSITORY } from "./application/ports/payroll-runs-repository.port";
import { AdjustmentsController } from "./http/adjustments.controller";
import { PayrollRunsController } from "./http/payroll-runs.controller";
import { PrismaAdjustmentsRepository } from "./infrastructure/prisma-adjustments.repository";
import { PrismaPayrollRunsRepository } from "./infrastructure/prisma-payroll-runs.repository";

/** Payroll: monthly runs (calculate → approve → export), payslips, and pay adjustments. */
@Module({
  // Attendance and leave through their public read services only.
  imports: [AuditModule, AttendanceModule, CompanyModule, EmployeesModule, LeaveModule],
  controllers: [AdjustmentsController, PayrollRunsController],
  providers: [
    AdjustmentsService,
    PayrollRunsService,
    IdempotencyService,
    { provide: ADJUSTMENTS_REPOSITORY, useClass: PrismaAdjustmentsRepository },
    { provide: PAYROLL_RUNS_REPOSITORY, useClass: PrismaPayrollRunsRepository },
  ],
})
export class PayrollModule {}
