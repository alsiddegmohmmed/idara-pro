import { Inject, Injectable } from "@nestjs/common";
import type { Employee, EmployeeDocument, SalaryComponent } from "@prisma/client";
import type { CreateEmployeeDocument, MyProfileUpdate } from "@idara-pro/shared";
import { AuditService } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { EmployeeDocumentsService, type UploadedFile } from "./employee-documents.service";
import { EMPLOYEES_REPOSITORY, type EmployeesRepositoryPort } from "./ports/employees-repository.port";
import { SalaryComponentsService } from "./salary-components.service";

const last4 = (iban: string | null): string | null => (iban ? iban.slice(-4) : null);

/**
 * Employee self-service (docs/domain/business-rules.md "Employee onboarding").
 * Every method resolves "my employee record" from the caller's user id — there is
 * deliberately no employeeId parameter anywhere, so there is no way to act on
 * someone else's record.
 */
@Injectable()
export class MyProfileService {
  constructor(
    @Inject(EMPLOYEES_REPOSITORY) private readonly employees: EmployeesRepositoryPort,
    private readonly documents: EmployeeDocumentsService,
    private readonly salaryComponents: SalaryComponentsService,
    private readonly audit: AuditService,
  ) {}

  private async mine(companyId: string, userId: string): Promise<Employee> {
    const employee = await this.employees.findByUserId(companyId, userId);
    if (!employee) throw new NotFoundError("No employee record is linked to this account", "employees.no_linked_employee");
    return employee;
  }

  findLinked(companyId: string, userId: string): Promise<Employee | null> {
    return this.employees.findByUserId(companyId, userId);
  }

  getProfile(companyId: string, userId: string): Promise<Employee> {
    return this.mine(companyId, userId);
  }

  async updateProfile(companyId: string, userId: string, input: MyProfileUpdate, ip: string | null): Promise<Employee> {
    const before = await this.mine(companyId, userId);
    const after = await this.employees.patchProfileFields(companyId, before.id, input);
    if (!after) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    const pick = (e: Employee): Record<string, unknown> => ({
      phone: e.phone,
      personalEmail: e.personalEmail,
      address: e.address,
      additionalPhone: e.additionalPhone,
    });
    await this.audit.record(companyId, {
      actorId: userId,
      action: "update_profile",
      entity: "employees",
      entityId: before.id,
      before: pick(before),
      after: pick(after),
      ip,
    });
    return after;
  }

  /** Does not touch `iban` (the approved one) — only queues the submission for HR. */
  async submitIban(companyId: string, userId: string, iban: string, ip: string | null): Promise<Employee> {
    const before = await this.mine(companyId, userId);
    const after = await this.employees.patchProfileFields(companyId, before.id, {
      pendingIban: iban,
      ibanReviewStatus: "pending_review",
      ibanReviewReason: null,
    });
    if (!after) throw new NotFoundError("Employee not found", "employees.employee.not_found");
    await this.audit.record(companyId, {
      actorId: userId,
      action: "submit_iban",
      entity: "employees",
      entityId: before.id,
      // Audit trail carries only the last 4 characters, never a full IBAN.
      before: { iban: last4(before.iban), pendingIban: last4(before.pendingIban) },
      after: { pendingIban: last4(iban) },
      ip,
    });
    return after;
  }

  async uploadDocument(
    companyId: string,
    userId: string,
    metadata: CreateEmployeeDocument,
    file: UploadedFile,
    ip: string | null,
  ): Promise<EmployeeDocument> {
    const employee = await this.mine(companyId, userId);
    return this.documents.upload(companyId, userId, employee.id, metadata, file, ip, "self");
  }

  async listDocuments(companyId: string, userId: string): Promise<EmployeeDocument[]> {
    const employee = await this.mine(companyId, userId);
    return this.documents.listByEmployee(companyId, employee.id);
  }

  async downloadDocument(companyId: string, userId: string, id: string, ip: string | null) {
    const employee = await this.mine(companyId, userId);
    return this.documents.download(companyId, userId, employee.id, id, ip);
  }

  /** Read-only: salary components are HR-owned, the employee can only view them. */
  async listSalaryComponents(companyId: string, userId: string): Promise<SalaryComponent[]> {
    const employee = await this.mine(companyId, userId);
    return this.salaryComponents.listByEmployee(companyId, employee.id);
  }
}
