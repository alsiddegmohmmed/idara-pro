import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

/**
 * Every method takes companyId explicitly and passes it into withTenant() — the
 * caller (a use case, in Stage 4) is responsible for sourcing it from the request
 * context (JWT), never from the request body (AGENTS.md §3 rule 1).
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreateUserInput): Promise<User> {
    return this.db.withTenant(companyId, (tx) =>
      tx.user.create({
        data: { companyId, email: input.email, passwordHash: input.passwordHash },
      }),
    );
  }

  async findByEmail(companyId: string, email: string): Promise<User | null> {
    return this.db.withTenant(companyId, (tx) => tx.user.findFirst({ where: { companyId, email } }));
  }
}
