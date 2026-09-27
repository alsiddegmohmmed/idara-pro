import { Injectable } from "@nestjs/common";
import type { Company } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { NotFoundError } from "../../../shared/errors/errors";

/** Reads the Company row itself — branches/schedules/holidays have their own
 * services for sub-resources; nothing read the company row directly until now. */
@Injectable()
export class CompaniesService {
  constructor(private readonly db: TenantDatabase) {}

  async findById(companyId: string): Promise<Company> {
    const company = await this.db.withTenant(companyId, (tx) => tx.company.findFirst({ where: { id: companyId } }));
    if (!company) throw new NotFoundError("Company not found", "company.not_found");
    return company;
  }
}
