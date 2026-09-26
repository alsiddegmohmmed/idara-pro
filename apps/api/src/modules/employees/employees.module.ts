import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { CompanyModule } from "../company";
import { DepartmentsService } from "./application/departments.service";
import { EmployeesService } from "./application/employees.service";
import { DEPARTMENTS_REPOSITORY } from "./application/ports/departments-repository.port";
import { EMPLOYEES_REPOSITORY } from "./application/ports/employees-repository.port";
import { PrismaDepartmentsRepository } from "./infrastructure/prisma-departments.repository";
import { PrismaEmployeesRepository } from "./infrastructure/prisma-employees.repository";
import { DepartmentsController } from "./http/departments.controller";
import { EmployeesController } from "./http/employees.controller";

@Module({
  // CompanyModule for BranchesService/WorkSchedulesService — EmployeesService
  // uses their findById() to verify a referenced branch/schedule belongs to
  // the caller's company.
  imports: [AuditModule, CompanyModule],
  controllers: [DepartmentsController, EmployeesController],
  providers: [
    DepartmentsService,
    EmployeesService,
    { provide: DEPARTMENTS_REPOSITORY, useClass: PrismaDepartmentsRepository },
    { provide: EMPLOYEES_REPOSITORY, useClass: PrismaEmployeesRepository },
  ],
})
export class EmployeesModule {}
