import { Injectable } from "@nestjs/common";
import type { Contract, EmployeeContact, EmployeeInsurance, InsurancePolicy } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type {
  ContactData,
  ContractData,
  EmployeeFileRepositoryPort,
  EnrolmentWithPolicy,
  ExpiryCandidate,
  ExpiryKind,
} from "../application/ports/employee-file-repository.port";

const employeeRef = { select: { id: true, fullNameAr: true, fullNameEn: true, userId: true, branchId: true, managerId: true } } as const;

const withPolicy = { policy: true } as const;

@Injectable()
export class PrismaEmployeeFileRepository implements EmployeeFileRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  listContacts(companyId: string, employeeId: string): Promise<EmployeeContact[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeContact.findMany({ where: { companyId, employeeId }, orderBy: [{ isEmergency: "desc" }, { createdAt: "asc" }] }),
    );
  }
  findContact(companyId: string, id: string): Promise<EmployeeContact | null> {
    return this.db.withTenant(companyId, (tx) => tx.employeeContact.findFirst({ where: { id, companyId } }));
  }
  createContact(companyId: string, employeeId: string, data: ContactData, createdBy: string): Promise<EmployeeContact> {
    return this.db.withTenant(companyId, (tx) => tx.employeeContact.create({ data: { companyId, employeeId, ...data, createdBy } }));
  }
  updateContact(companyId: string, id: string, data: Partial<ContactData>): Promise<EmployeeContact> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.employeeContact.updateMany({ where: { id, companyId }, data });
      return tx.employeeContact.findFirstOrThrow({ where: { id, companyId } });
    });
  }
  async deleteContact(companyId: string, id: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employeeContact.deleteMany({ where: { id, companyId } }));
  }
  async clearEmergency(companyId: string, employeeId: string, exceptId: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.employeeContact.updateMany({ where: { companyId, employeeId, id: { not: exceptId } }, data: { isEmergency: false } }),
    );
  }

  listContracts(companyId: string, employeeId: string): Promise<Contract[]> {
    return this.db.withTenant(companyId, (tx) => tx.contract.findMany({ where: { companyId, employeeId }, orderBy: { startDate: "desc" } }));
  }
  findContract(companyId: string, id: string): Promise<Contract | null> {
    return this.db.withTenant(companyId, (tx) => tx.contract.findFirst({ where: { id, companyId } }));
  }
  findActiveContract(companyId: string, employeeId: string): Promise<Contract | null> {
    return this.db.withTenant(companyId, (tx) => tx.contract.findFirst({ where: { companyId, employeeId, status: "active" } }));
  }
  createContract(companyId: string, employeeId: string, data: ContractData, createdBy: string): Promise<Contract> {
    return this.db.withTenant(companyId, (tx) => tx.contract.create({ data: { companyId, employeeId, ...data, createdBy } }));
  }
  updateContract(companyId: string, id: string, data: Partial<ContractData> & { status?: string }): Promise<Contract> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.contract.updateMany({ where: { id, companyId }, data });
      return tx.contract.findFirstOrThrow({ where: { id, companyId } });
    });
  }

  listPolicies(companyId: string): Promise<Array<InsurancePolicy & { _count: { members: number } }>> {
    return this.db.withTenant(companyId, (tx) =>
      tx.insurancePolicy.findMany({ where: { companyId }, include: { _count: { select: { members: true } } }, orderBy: { endDate: "desc" } }),
    );
  }
  findPolicy(companyId: string, id: string): Promise<InsurancePolicy | null> {
    return this.db.withTenant(companyId, (tx) => tx.insurancePolicy.findFirst({ where: { id, companyId } }));
  }
  createPolicy(companyId: string, data: Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt">): Promise<InsurancePolicy> {
    return this.db.withTenant(companyId, (tx) => tx.insurancePolicy.create({ data: { companyId, ...data } }));
  }
  updatePolicy(
    companyId: string,
    id: string,
    data: Partial<Omit<InsurancePolicy, "id" | "companyId" | "createdAt" | "updatedAt" | "createdBy">>,
  ): Promise<InsurancePolicy> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.insurancePolicy.updateMany({ where: { id, companyId }, data });
      return tx.insurancePolicy.findFirstOrThrow({ where: { id, companyId } });
    });
  }
  listEnrolments(companyId: string, employeeId: string): Promise<EnrolmentWithPolicy[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employeeInsurance.findMany({ where: { companyId, employeeId }, include: withPolicy, orderBy: { startDate: "desc" } }),
    );
  }
  findEnrolment(companyId: string, id: string): Promise<EnrolmentWithPolicy | null> {
    return this.db.withTenant(companyId, (tx) => tx.employeeInsurance.findFirst({ where: { id, companyId }, include: withPolicy }));
  }
  createEnrolment(companyId: string, data: Omit<EmployeeInsurance, "id" | "companyId" | "createdAt" | "updatedAt">): Promise<EnrolmentWithPolicy> {
    return this.db.withTenant(companyId, (tx) => tx.employeeInsurance.create({ data: { companyId, ...data }, include: withPolicy }));
  }
  updateEnrolment(
    companyId: string,
    id: string,
    data: Partial<Omit<EmployeeInsurance, "id" | "companyId" | "employeeId" | "createdAt" | "updatedAt" | "createdBy">>,
  ): Promise<EnrolmentWithPolicy> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.employeeInsurance.updateMany({ where: { id, companyId }, data });
      return tx.employeeInsurance.findFirstOrThrow({ where: { id, companyId }, include: withPolicy });
    });
  }
  async deleteEnrolment(companyId: string, id: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.employeeInsurance.deleteMany({ where: { id, companyId } }));
  }

  expiryCandidates(companyId: string, since: Date, until: Date): Promise<ExpiryCandidate[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const window = { gte: since, lte: until };
      const active = { status: "active" as const };
      const [ends, probations, enrolments] = await Promise.all([
        tx.contract.findMany({ where: { companyId, status: "active", endDate: window, employee: active }, include: { employee: employeeRef } }),
        tx.contract.findMany({ where: { companyId, status: "active", probationEndDate: window, employee: active }, include: { employee: employeeRef } }),
        tx.employeeInsurance.findMany({
          where: { companyId, employee: active, OR: [{ endDate: window }, { endDate: null, policy: { endDate: window } }] },
          include: { employee: employeeRef, policy: { select: { endDate: true } } },
        }),
      ]);
      return [
        ...ends.map((c) => ({ kind: "contract_end" as ExpiryKind, entityId: c.id, date: c.endDate as Date, employee: c.employee })),
        ...probations.map((c) => ({ kind: "probation_end" as ExpiryKind, entityId: c.id, date: c.probationEndDate as Date, employee: c.employee })),
        ...enrolments.map((e) => ({ kind: "insurance_end" as ExpiryKind, entityId: e.id, date: e.endDate ?? e.policy.endDate, employee: e.employee })),
      ];
    });
  }

  notifiedThresholds(companyId: string, kind: ExpiryKind, entityIds: string[]): Promise<Map<string, Set<number>>> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = entityIds.length ? await tx.alertNotice.findMany({ where: { companyId, kind, entityId: { in: entityIds } } }) : [];
      const map = new Map<string, Set<number>>();
      for (const r of rows) map.set(r.entityId, new Set([...(map.get(r.entityId) ?? []), r.thresholdDays]));
      return map;
    });
  }

  async recordNotices(companyId: string, rows: Array<{ kind: ExpiryKind; entityId: string; thresholdDays: number }>): Promise<void> {
    if (rows.length === 0) return;
    await this.db.withTenant(companyId, (tx) => tx.alertNotice.createMany({ data: rows.map((r) => ({ companyId, ...r })), skipDuplicates: true }));
  }
}
