import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { AuthModule } from "../auth";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { LeaveRequestsService } from "./application/leave-requests.service";
import { LEAVE_REPOSITORY } from "./application/ports/leave-repository.port";
import { LeaveController } from "./http/leave.controller";
import { PrismaLeaveRepository } from "./infrastructure/prisma-leave.repository";

@Module({
  // leave → attendance is the "leave.approved" event only (docs/architecture/overview.md), no import.
  imports: [AuditModule, AuthModule, CompanyModule, EmployeesModule],
  controllers: [LeaveController],
  providers: [LeaveRequestsService, { provide: LEAVE_REPOSITORY, useClass: PrismaLeaveRepository }],
})
export class LeaveModule {}
