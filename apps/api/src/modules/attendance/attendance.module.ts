import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { AuthModule } from "../auth";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { IdempotencyService } from "../../shared/idempotency/idempotency.service";
import { AttendanceQueriesService } from "./application/attendance-queries.service";
import { CloseAttendanceDaysUseCase } from "./application/close-attendance-days.use-case";
import { ShortLeaveApprovedListener } from "./application/shortleave-approved.listener";
import { LeaveApprovedListener } from "./application/leave-approved.listener";
import { CorrectAttendanceUseCase } from "./application/correct-attendance.use-case";
import { RecordPunchUseCase } from "./application/record-punch.use-case";
import { ATTENDANCE_REPOSITORY } from "./application/ports/attendance-repository.port";
import { AttendanceController } from "./http/attendance.controller";
import { PrismaAttendanceRepository } from "./infrastructure/prisma-attendance.repository";

@Module({
  // AuthModule for UsersRepository.findPermissionScope (role scopes); EmployeesModule/CompanyModule
  // through their public services only.
  imports: [AuditModule, AuthModule, CompanyModule, EmployeesModule],
  controllers: [AttendanceController],
  providers: [
    RecordPunchUseCase,
    CorrectAttendanceUseCase,
    CloseAttendanceDaysUseCase,
    AttendanceQueriesService,
    LeaveApprovedListener,
    ShortLeaveApprovedListener,
    IdempotencyService,
    { provide: ATTENDANCE_REPOSITORY, useClass: PrismaAttendanceRepository },
  ],
  // For the worker's attendance-close-job.module.ts only.
  exports: [CloseAttendanceDaysUseCase],
})
export class AttendanceModule {}
