import { Injectable } from "@nestjs/common";
import { AuditRepository, type CreateAuditLogEntryInput } from "../infrastructure/audit.repository";

/**
 * Public API other modules call to satisfy AGENTS.md §3 rule 6: create/update/
 * delete on employees, salary components, attendance corrections, leave
 * decisions, custody, and payroll must write an audit entry. Called from the
 * employees module (departments, employees, salary components, documents,
 * the expiry-check job) as of Phase 1; more callers land as attendance,
 * leave, custody, and payroll are built.
 */
@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(companyId: string, input: CreateAuditLogEntryInput): Promise<void> {
    await this.repository.create(companyId, input);
  }
}
