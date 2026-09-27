export { EmployeesModule } from "./employees.module";
export { CheckDocumentExpiriesUseCase } from "./application/check-document-expiries.use-case";
export type { DocumentExpiryEventPayload } from "./application/check-document-expiries.use-case";
// Worker-only (docs/adr/0006) — only worker.module.ts imports this.
export { DocumentExpiryJobModule } from "./document-expiry-job.module";
