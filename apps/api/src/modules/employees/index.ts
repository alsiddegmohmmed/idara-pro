export { EmployeesModule } from "./employees.module";
export { EmployeesService } from "./application/employees.service";
export { EmployeeScopeService } from "./application/employee-scope.service";
export { SalaryComponentsService } from "./application/salary-components.service";
export { CheckDocumentExpiriesUseCase } from "./application/check-document-expiries.use-case";
export type { DocumentExpiryEventPayload } from "./application/check-document-expiries.use-case";
// Worker-only (docs/adr/0006) — only worker.module.ts imports this.
export { DocumentExpiryJobModule } from "./document-expiry-job.module";
