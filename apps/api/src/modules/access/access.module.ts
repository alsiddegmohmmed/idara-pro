import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { AuthModule } from "../auth";
import { CompanyModule } from "../company";
import { EmployeesModule } from "../employees";
import { AccessManagementService } from "./application/access-management.service";
import { ACCESS_REPOSITORY } from "./application/ports/access-repository.port";
import { AccessController } from "./http/access.controller";
import { PrismaAccessRepository } from "./infrastructure/prisma-access.repository";

/** Roles, role assignments and the access review (ADR-0011 §5). Enforcement itself is AccessPolicy (shared). */
@Module({
  // AuthModule: the company's logins; EmployeesModule: who each login is; CompanyModule: branch checks.
  imports: [AuditModule, AuthModule, CompanyModule, EmployeesModule],
  controllers: [AccessController],
  providers: [AccessManagementService, { provide: ACCESS_REPOSITORY, useClass: PrismaAccessRepository }],
})
export class AccessModule {}
