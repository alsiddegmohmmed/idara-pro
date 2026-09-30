import { Injectable } from "@nestjs/common";
import type { Contract, EmployeeContact, EmployeeInsurance, InsurancePolicy } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import type { ContactData, ContractData, EmployeeFileRepositoryPort, EnrolmentWithPolicy } from "../application/ports/employee-file-repository.port";

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
}
