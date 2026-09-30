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

export interface AuditListFilter {
  entity?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  /** Inclusive instants. */
  from?: Date;
  to?: Date;
  /** Keyset cursor: entries strictly older than (at, id). */
  before?: { at: Date; id: string };
  limit: number;
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

  /** Newest first, keyset-paginated on (at, id) so paging stays fast on a large log. */
  async list(companyId: string, f: AuditListFilter): Promise<AuditLogEntry[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.auditLogEntry.findMany({
        where: {
          companyId,
          ...(f.entity ? { entity: f.entity } : {}),
          ...(f.entityId ? { entityId: f.entityId } : {}),
          ...(f.actorId ? { actorId: f.actorId } : {}),
          ...(f.action ? { action: f.action } : {}),
          ...(f.from || f.to ? { at: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
          ...(f.before ? { OR: [{ at: { lt: f.before.at } }, { at: f.before.at, id: { lt: f.before.id } }] } : {}),
        },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take: f.limit,
      }),
    );
  }

  /** Emails of the actors on a page, for display. Read here (not via the auth module, which depends on audit). */
  async actorEmails(companyId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    return this.db.withTenant(companyId, async (tx) => {
      const users = await tx.user.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, email: true } });
      return new Map(users.map((u) => [u.id, u.email]));
    });
  }
}
