import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { AuthModule } from "../auth";
import { CompanyModule } from "../company";
import { CheckDocumentExpiriesUseCase } from "./application/check-document-expiries.use-case";
import { DepartmentsService } from "./application/departments.service";
import { EmployeeDocumentsService } from "./application/employee-documents.service";
import { EmployeesService } from "./application/employees.service";
import { EmployeeScopeService } from "./application/employee-scope.service";
import { MyProfileService } from "./application/my-profile.service";
import { ReviewEmployeeChangesService } from "./application/review-employee-changes.service";
import { InviteEmployeeUseCase } from "./application/invite-employee.use-case";
import { LinkEmployeeUserListener } from "./application/link-employee-user.listener";
import { SalaryComponentsService } from "./application/salary-components.service";
import { DEPARTMENTS_REPOSITORY } from "./application/ports/departments-repository.port";
import { EMPLOYEE_DOCUMENTS_REPOSITORY } from "./application/ports/employee-documents-repository.port";
import { EMPLOYEES_REPOSITORY } from "./application/ports/employees-repository.port";
import { SALARY_COMPONENTS_REPOSITORY } from "./application/ports/salary-components-repository.port";
import { PrismaDepartmentsRepository } from "./infrastructure/prisma-departments.repository";
import { PrismaEmployeeDocumentsRepository } from "./infrastructure/prisma-employee-documents.repository";
import { PrismaEmployeesRepository } from "./infrastructure/prisma-employees.repository";
import { PrismaSalaryComponentsRepository } from "./infrastructure/prisma-salary-components.repository";
import { DepartmentsController } from "./http/departments.controller";
import { EmployeeDocumentsController } from "./http/employee-documents.controller";
import { EmployeesController } from "./http/employees.controller";
import { MeController } from "./http/me.controller";
import { ReviewController } from "./http/review.controller";
import { SalaryComponentsController } from "./http/salary-components.controller";

@Module({
  // CompanyModule for BranchesService/WorkSchedulesService — EmployeesService
  // uses their findById() to verify a referenced branch/schedule belongs to
  // the caller's company. FILE_STORAGE comes from the global StorageModule.
  // AuthModule for InvitationsService (docs/adr/0007-invitations.md) — the
  // reverse link (accept → set employees.user_id) is event-based, no import.
  imports: [AuditModule, AuthModule, CompanyModule],
  controllers: [
    DepartmentsController,
    EmployeesController,
    SalaryComponentsController,
    EmployeeDocumentsController,
    MeController,
    ReviewController,
  ],
  providers: [
    DepartmentsService,
    EmployeesService,
    EmployeeScopeService,
    SalaryComponentsService,
    EmployeeDocumentsService,
    CheckDocumentExpiriesUseCase,
    InviteEmployeeUseCase,
    LinkEmployeeUserListener,
    MyProfileService,
    ReviewEmployeeChangesService,
    { provide: DEPARTMENTS_REPOSITORY, useClass: PrismaDepartmentsRepository },
    { provide: EMPLOYEES_REPOSITORY, useClass: PrismaEmployeesRepository },
    { provide: SALARY_COMPONENTS_REPOSITORY, useClass: PrismaSalaryComponentsRepository },
    { provide: EMPLOYEE_DOCUMENTS_REPOSITORY, useClass: PrismaEmployeeDocumentsRepository },
  ],
  // CheckDocumentExpiriesUseCase exported for the worker process's
  // document-expiry-job.module.ts (docs/adr/0006) — the HTTP AppModule never
  // needs it and never touches BullMQ/Redis as a result.
  // EmployeesService for attendance (and later leave/payroll): read-only lookups of employee records.
  exports: [CheckDocumentExpiriesUseCase, EmployeesService, EmployeeScopeService],
})
export class EmployeesModule {}
