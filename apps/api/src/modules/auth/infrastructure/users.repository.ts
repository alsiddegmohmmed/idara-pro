import { Injectable } from "@nestjs/common";
import type { User, UserStatus } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  // Omitted: the schema's own default ("invited") applies. Accepting an
  // invitation passes "active" explicitly — the person just set a real
  // password, there's no separate "invited, no password yet" User row in
  // this codebase's design (see docs/adr/0007-invitations.md).
  status?: UserStatus;
}

/**
 * Every method takes companyId explicitly and passes it into withTenant() — the
 * caller (a use case) is responsible for sourcing it from the request context
 * (JWT), never from the request body (AGENTS.md §3 rule 1). The one exception
 * is findByEmailAcrossCompanies, documented on that method.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreateUserInput): Promise<User> {
    return this.db.withTenant(companyId, (tx) =>
      tx.user.create({
        data: { companyId, email: input.email, passwordHash: input.passwordHash, status: input.status },
      }),
    );
  }

  async findByEmail(companyId: string, email: string): Promise<User | null> {
    return this.db.withTenant(companyId, (tx) => tx.user.findFirst({ where: { companyId, email } }));
  }

  /**
   * Login and password-reset-request only have an email, not a companyId yet
   * (companyId is exactly what this resolves). Every other lookup must use
   * findByEmail with a companyId from an authenticated request instead.
   */
  async findByEmailAcrossCompanies(email: string): Promise<User | null> {
    return this.db.withoutTenant((client) => client.user.findFirst({ where: { email } }));
  }

  async updateLastLogin(companyId: string, userId: string, at: Date): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.user.updateMany({ where: { id: userId, companyId }, data: { lastLoginAt: at } }),
    );
  }

  async updatePasswordHash(companyId: string, userId: string, passwordHash: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) =>
      tx.user.updateMany({ where: { id: userId, companyId }, data: { passwordHash } }),
    );
  }

  /** Compensating cleanup for AcceptInvitationUseCase (docs/adr/0007-invitations.md)
   * — if linking the employee fails after the User was already created, delete
   * it rather than leave an orphan that blocks every retry via the
   * @@unique([companyId, email]) constraint. */
  async delete(companyId: string, userId: string): Promise<void> {
    await this.db.withTenant(companyId, (tx) => tx.user.deleteMany({ where: { id: userId, companyId } }));
  }

  /** Permission codes across every role the user holds (system + company roles). */
  async findPermissionCodes(companyId: string, userId: string): Promise<string[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const userRoles = await tx.userRole.findMany({
        where: { userId },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      });
      const codes = new Set<string>();
      for (const userRole of userRoles) {
        for (const rolePermission of userRole.role.rolePermissions) {
          codes.add(rolePermission.permission.code);
        }
      }
      return [...codes];
    });
  }

  /** Inverse of findPermissionCodes — every user in the company holding a given
   * permission through any role they have. Used to derive notification
   * recipients (docs/adr/0006-document-expiry-job.md) where "who should know
   * about this" has no stored preference yet, only the permission system. */
  async findByPermission(companyId: string, code: string): Promise<User[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const users = await tx.user.findMany({
        where: {
          companyId,
          userRoles: { some: { role: { rolePermissions: { some: { permission: { code } } } } } },
        },
      });
      return users;
    });
  }
}
