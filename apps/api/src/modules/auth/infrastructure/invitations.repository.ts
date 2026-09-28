import { Injectable } from "@nestjs/common";
import type { Invitation } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreateInvitationInput {
  employeeId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: string | null;
}

@Injectable()
export class InvitationsRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreateInvitationInput): Promise<Invitation> {
    return this.db.withTenant(companyId, (tx) => tx.invitation.create({ data: { companyId, ...input } }));
  }

  /** Accept arrives with only the invitation token, no session — same
   * bootstrap problem as UsersRepository.findByEmailAcrossCompanies. */
  async findValidByHashAcrossCompanies(tokenHash: string): Promise<Invitation | null> {
    return this.db.withoutTenant((client) =>
      client.invitation.findFirst({
        where: { tokenHash, acceptedAt: null, expiresAt: { gt: new Date() } },
      }),
    );
  }

  /** Kills invitations that haven't been used yet (the employee was deactivated). */
  async expireOutstandingForEmployee(companyId: string, employeeId: string, now: Date): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.invitation.updateMany({
        where: { companyId, employeeId, acceptedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
    );
  }

  /** Consumes the invitation only if it is still unused and unexpired (checked in the same statement,
   * inside the accept transaction); false means someone else got there first. */
  async markAccepted(companyId: string, id: string, acceptedAt: Date): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id, companyId, acceptedAt: null, expiresAt: { gt: acceptedAt } },
        data: { acceptedAt },
      });
      return count > 0;
    });
  }
}
