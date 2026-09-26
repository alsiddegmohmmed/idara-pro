import { Injectable } from "@nestjs/common";
import type { AuditLogEntry, Prisma } from "@prisma/client";
import { TenantDatabase } from "../../../shared/database/with-tenant";

export interface CreateAuditLogEntryInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string | null;
}

/** Append-only (AGENTS.md §3 rule 6): deliberately no update or delete method. */
@Injectable()
export class AuditRepository {
  constructor(private readonly db: TenantDatabase) {}

  async create(companyId: string, input: CreateAuditLogEntryInput): Promise<AuditLogEntry> {
    return this.db.withTenant(companyId, (tx) =>
      tx.auditLogEntry.create({
        data: {
          companyId,
          actorId: input.actorId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          before: input.before as Prisma.InputJsonValue | undefined,
          after: input.after as Prisma.InputJsonValue | undefined,
          ip: input.ip,
        },
      }),
    );
  }
}
