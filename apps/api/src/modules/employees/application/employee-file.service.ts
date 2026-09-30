import { Inject, Injectable } from "@nestjs/common";
import type { Contract, EmployeeContact } from "@prisma/client";
import {
  COMPANY_SETTING_KEYS,
  type ContactInput,
  type ContactView,
  type ContractView,
  type CreateContract,
  type EndContract,
  type EnrolmentInput,
  type EnrolmentView,
  type InsurancePolicyInput,
  type InsurancePolicyView,
  type UpdateContactInput,
  type UpdateContract,
} from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { CompanySettingsService } from "../../company";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors/errors";
import { EMPLOYEE_FILE_REPOSITORY, type EmployeeFileRepositoryPort, type EnrolmentWithPolicy } from "./ports/employee-file-repository.port";

/** Owner default (2026-09-30); a company setting overrides it. */
export const DEFAULT_PROBATION_DAYS = 90;

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const day = (v: string): Date => new Date(`${v}T00:00:00.000Z`);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

export const toContactView = (c: EmployeeContact): ContactView => ({
  id: c.id,
  name: c.name,
  relationship: c.relationship as ContactView["relationship"],
  phone: c.phone,
  isEmergency: c.isEmergency,
});

export const toContractView = (c: Contract): ContractView => ({
  id: c.id,
  employeeId: c.employeeId,
  type: c.type as ContractView["type"],
  startDate: iso(c.startDate) as string,
  endDate: iso(c.endDate),
  probationEndDate: iso(c.probationEndDate),
  status: c.status as ContractView["status"],
  renewedFromId: c.renewedFromId,
  notes: c.notes,
  createdAt: c.createdAt.toISOString(),
});

export const toEnrolmentView = (e: EnrolmentWithPolicy): EnrolmentView => ({
  id: e.id,
  employeeId: e.employeeId,
  policyId: e.policyId,
  provider: e.policy.provider,
  policyNumber: e.policy.policyNumber,
  class: e.class,
  memberNumber: e.memberNumber,
  startDate: iso(e.startDate) as string,
  endDate: iso(e.endDate) ?? iso(e.policy.endDate),
  policyEndDate: iso(e.policy.endDate) as string,
});

/**
 * The employee file (Phase 5): relatives and trusted contacts, contracts (one active at a time, renewals
 * chain), and insurance. Callers check permission and reach for the employee first; every write is audited.
 */
@Injectable()
export class EmployeeFileService {
  constructor(
    @Inject(EMPLOYEE_FILE_REPOSITORY) private readonly repository: EmployeeFileRepositoryPort,
    private readonly settings: CompanySettingsService,
    private readonly audit: AuditService,
    private readonly db: TenantDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- contacts ----------

  async listContacts(companyId: string, employeeId: string): Promise<ContactView[]> {
    return (await this.repository.listContacts(companyId, employeeId)).map(toContactView);
  }

  async addContact(companyId: string, actorId: string, employeeId: string, input: ContactInput, ip: string | null): Promise<ContactView> {
    return this.db.transaction(companyId, async () => {
      const created = await this.repository.createContact(companyId, employeeId, input, actorId);
      if (created.isEmergency) await this.repository.clearEmergency(companyId, employeeId, created.id);
      await this.audit.record(companyId, { actorId, action: "create", entity: "employee_contacts", entityId: created.id, after: toAuditSnapshot(created), ip });
      return toContactView(created);
    });
  }

  async updateContact(companyId: string, actorId: string, employeeId: string, id: string, input: UpdateContactInput, ip: string | null): Promise<ContactView> {
    return this.db.transaction(companyId, async () => {
      const before = await this.contactOf(companyId, employeeId, id);
      const after = await this.repository.updateContact(companyId, id, input);
      if (after.isEmergency) await this.repository.clearEmergency(companyId, employeeId, id);
      await this.audit.record(companyId, {
        actorId, action: "update", entity: "employee_contacts", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip,
      });
      return toContactView(after);
    });
  }

  async removeContact(companyId: string, actorId: string, employeeId: string, id: string, ip: string | null): Promise<void> {
    await this.db.transaction(companyId, async () => {
      const before = await this.contactOf(companyId, employeeId, id);
      await this.repository.deleteContact(companyId, id);
      await this.audit.record(companyId, { actorId, action: "delete", entity: "employee_contacts", entityId: id, before: toAuditSnapshot(before), ip });
    });
  }

  private async contactOf(companyId: string, employeeId: string, id: string): Promise<EmployeeContact> {
    const c = await this.repository.findContact(companyId, id);
    if (!c || c.employeeId !== employeeId) throw new NotFoundError("Contact not found", "employees.contact.not_found");
    return c;
  }

  // ---------- contracts ----------

  async listContracts(companyId: string, employeeId: string): Promise<ContractView[]> {
    return (await this.repository.listContracts(companyId, employeeId)).map(toContractView);
  }

  /** The first contract (no active one yet). Probation defaults to the company's probation days when omitted. */
  async createContract(companyId: string, actorId: string, employeeId: string, input: CreateContract, ip: string | null): Promise<ContractView> {
    return this.db.transaction(companyId, async () => {
      if (await this.repository.findActiveContract(companyId, employeeId)) {
        throw new BusinessRuleError("employees.contract.active_exists", "This employee already has an active contract; renew or end it");
      }
      const created = await this.repository.createContract(companyId, employeeId, await this.contractData(companyId, input, null), actorId);
      await this.audit.record(companyId, { actorId, action: "create", entity: "contracts", entityId: created.id, after: toAuditSnapshot(created), ip });
      return toContractView(created);
    });
  }

  /** A renewal: the active contract becomes "renewed" and a new one starts, pointing back at it. No probation by default. */
  async renewContract(companyId: string, actorId: string, employeeId: string, id: string, input: CreateContract, ip: string | null): Promise<ContractView> {
    return this.db.transaction(companyId, async () => {
      const current = await this.contractOf(companyId, employeeId, id);
      if (current.status !== "active") throw new BusinessRuleError("employees.contract.not_active", "Only the active contract can be renewed");
      if (day(input.startDate).getTime() <= current.startDate.getTime()) {
        throw new BusinessRuleError("employees.contract.renewal_before_start", "The renewal must start after the current contract started");
      }
      await this.repository.updateContract(companyId, id, { status: "renewed" });
      const renewed = await this.repository.createContract(
        companyId,
        employeeId,
        { ...(await this.contractData(companyId, { ...input, probationEndDate: input.probationEndDate ?? null }, id)) },
        actorId,
      );
      await this.audit.record(companyId, {
        actorId, action: "renew", entity: "contracts", entityId: renewed.id, before: { renewedContractId: id }, after: toAuditSnapshot(renewed), ip,
      });
      return toContractView(renewed);
    });
  }

  async updateContract(companyId: string, actorId: string, employeeId: string, id: string, input: UpdateContract, ip: string | null): Promise<ContractView> {
    return this.db.transaction(companyId, async () => {
      const before = await this.contractOf(companyId, employeeId, id);
      const endDate = input.endDate === undefined ? before.endDate : input.endDate ? day(input.endDate) : null;
      const probation = input.probationEndDate === undefined ? before.probationEndDate : input.probationEndDate ? day(input.probationEndDate) : null;
      if (before.type === "fixed_term" && !endDate) throw new BusinessRuleError("employees.contract.end_date_required", "A fixed-term contract needs an end date");
      if ((endDate && endDate < before.startDate) || (probation && probation < before.startDate)) {
        throw new BusinessRuleError("employees.contract.invalid_dates", "Dates must be on or after the start date");
      }
      const after = await this.repository.updateContract(companyId, id, {
        endDate: input.endDate === undefined ? undefined : endDate,
        probationEndDate: input.probationEndDate === undefined ? undefined : probation,
        notes: input.notes === undefined ? undefined : input.notes,
      });
      await this.audit.record(companyId, {
        actorId, action: "update", entity: "contracts", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip,
      });
      return toContractView(after);
    });
  }

  /** Ends the active contract on a date (resignation, termination, not renewed). */
  async endContract(companyId: string, actorId: string, employeeId: string, id: string, input: EndContract, ip: string | null): Promise<ContractView> {
    return this.db.transaction(companyId, async () => {
      const before = await this.contractOf(companyId, employeeId, id);
      if (before.status !== "active") throw new BusinessRuleError("employees.contract.not_active", "Only the active contract can be ended");
      if (day(input.endDate) < before.startDate) throw new BusinessRuleError("employees.contract.invalid_dates", "Dates must be on or after the start date");
      const after = await this.repository.updateContract(companyId, id, {
        status: "ended",
        endDate: day(input.endDate),
        notes: input.notes ? [before.notes, input.notes].filter(Boolean).join("\n") : undefined,
      });
      await this.audit.record(companyId, {
        actorId, action: "end", entity: "contracts", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip,
      });
      return toContractView(after);
    });
  }

  private async contractOf(companyId: string, employeeId: string, id: string): Promise<Contract> {
    const c = await this.repository.findContract(companyId, id);
    if (!c || c.employeeId !== employeeId) throw new NotFoundError("Contract not found", "employees.contract.not_found");
    return c;
  }

  private async contractData(companyId: string, input: CreateContract, renewedFromId: string | null) {
    const start = day(input.startDate);
    let probation: Date | null;
    if (input.probationEndDate !== undefined) probation = input.probationEndDate ? day(input.probationEndDate) : null;
    else {
      const days = await this.settings.getNumber(companyId, COMPANY_SETTING_KEYS.CONTRACT_PROBATION_DAYS, start, DEFAULT_PROBATION_DAYS);
      probation = days > 0 ? addDays(start, days - 1) : null;
    }
    return {
      type: input.type,
      startDate: start,
      endDate: input.type === "open_ended" ? (input.endDate ? day(input.endDate) : null) : day(input.endDate as string),
      probationEndDate: probation,
      notes: input.notes ?? null,
      renewedFromId,
    };
  }

  // ---------- insurance ----------

  async listPolicies(companyId: string): Promise<InsurancePolicyView[]> {
    return (await this.repository.listPolicies(companyId)).map((p) => ({
      id: p.id,
      provider: p.provider,
      policyNumber: p.policyNumber,
      startDate: iso(p.startDate) as string,
      endDate: iso(p.endDate) as string,
      notes: p.notes,
      members: p._count.members,
    }));
  }

  async savePolicy(companyId: string, actorId: string, id: string | null, input: InsurancePolicyInput, ip: string | null): Promise<void> {
    await this.db.transaction(companyId, async () => {
      const data = { provider: input.provider, policyNumber: input.policyNumber, startDate: day(input.startDate), endDate: day(input.endDate), notes: input.notes ?? null };
      if (id) {
        const before = await this.repository.findPolicy(companyId, id);
        if (!before) throw new NotFoundError("Policy not found", "employees.insurance_policy.not_found");
        const after = await this.repository.updatePolicy(companyId, id, data);
        await this.audit.record(companyId, { actorId, action: "update", entity: "insurance_policies", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip });
      } else {
        const created = await this.repository.createPolicy(companyId, { ...data, createdBy: actorId });
        await this.audit.record(companyId, { actorId, action: "create", entity: "insurance_policies", entityId: created.id, after: toAuditSnapshot(created), ip });
      }
    });
  }

  async listEnrolments(companyId: string, employeeId: string): Promise<EnrolmentView[]> {
    return (await this.repository.listEnrolments(companyId, employeeId)).map(toEnrolmentView);
  }

  async enrol(companyId: string, actorId: string, employeeId: string, input: EnrolmentInput, ip: string | null): Promise<EnrolmentView> {
    return this.db.transaction(companyId, async () => {
      const policy = await this.repository.findPolicy(companyId, input.policyId);
      if (!policy) throw new NotFoundError("Policy not found", "employees.insurance_policy.not_found");
      const created = await this.repository.createEnrolment(companyId, {
        employeeId,
        policyId: policy.id,
        class: input.class,
        memberNumber: input.memberNumber ?? null,
        startDate: day(input.startDate),
        endDate: input.endDate ? day(input.endDate) : null,
        createdBy: actorId,
      });
      await this.audit.record(companyId, { actorId, action: "create", entity: "employee_insurance", entityId: created.id, after: toAuditSnapshot(created), ip });
      return toEnrolmentView(created);
    });
  }

  async updateEnrolment(companyId: string, actorId: string, employeeId: string, id: string, input: EnrolmentInput, ip: string | null): Promise<EnrolmentView> {
    return this.db.transaction(companyId, async () => {
      const before = await this.enrolmentOf(companyId, employeeId, id);
      if (!(await this.repository.findPolicy(companyId, input.policyId))) throw new NotFoundError("Policy not found", "employees.insurance_policy.not_found");
      const after = await this.repository.updateEnrolment(companyId, id, {
        policyId: input.policyId,
        class: input.class,
        memberNumber: input.memberNumber ?? null,
        startDate: day(input.startDate),
        endDate: input.endDate ? day(input.endDate) : null,
      });
      await this.audit.record(companyId, {
        actorId, action: "update", entity: "employee_insurance", entityId: id, before: toAuditSnapshot(before), after: toAuditSnapshot(after), ip,
      });
      return toEnrolmentView(after);
    });
  }

  async removeEnrolment(companyId: string, actorId: string, employeeId: string, id: string, ip: string | null): Promise<void> {
    await this.db.transaction(companyId, async () => {
      const before = await this.enrolmentOf(companyId, employeeId, id);
      await this.repository.deleteEnrolment(companyId, id);
      await this.audit.record(companyId, { actorId, action: "delete", entity: "employee_insurance", entityId: id, before: toAuditSnapshot(before), ip });
    });
  }

  private async enrolmentOf(companyId: string, employeeId: string, id: string): Promise<EnrolmentWithPolicy> {
    const e = await this.repository.findEnrolment(companyId, id);
    if (!e || e.employeeId !== employeeId) throw new NotFoundError("Enrolment not found", "employees.insurance.not_found");
    return e;
  }

  /** Today in the company calendar (for "current" badges and defaults). */
  today(): Date {
    return companyDateOnly(this.clock.now());
  }
}
