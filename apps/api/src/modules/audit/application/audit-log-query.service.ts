import { Injectable } from "@nestjs/common";
import type { AuditPage, AuditQuery } from "@idara-pro/shared";
import { BusinessRuleError } from "../../../shared/errors/errors";
import { AuditRepository } from "../infrastructure/audit.repository";

const encode = (at: Date, id: string): string => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");

function decode(cursor: string): { at: Date; id: string } {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(at ?? "");
  if (!id || Number.isNaN(date.getTime())) throw new BusinessRuleError("audit.invalid_cursor", "Invalid cursor");
  return { at: date, id };
}

/** Company day boundaries (Asia/Riyadh, UTC+3, no DST) for the from/to filter. */
const dayStart = (iso: string): Date => new Date(`${iso}T00:00:00+03:00`);
const dayEnd = (iso: string): Date => new Date(new Date(`${iso}T00:00:00+03:00`).getTime() + 86_400_000 - 1);

/** السجل: reading the audit log (append-only; nothing here writes). */
@Injectable()
export class AuditLogQueryService {
  constructor(private readonly repository: AuditRepository) {}

  async list(companyId: string, q: AuditQuery): Promise<AuditPage> {
    const rows = await this.repository.list(companyId, {
      entity: q.entity,
      entityId: q.entityId,
      actorId: q.actorId,
      action: q.action,
      from: q.from ? dayStart(q.from) : undefined,
      to: q.to ? dayEnd(q.to) : undefined,
      before: q.cursor ? decode(q.cursor) : undefined,
      limit: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const emails = await this.repository.actorEmails(companyId, [...new Set(page.map((r) => r.actorId).filter((x): x is string => x !== null))]);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        actorId: r.actorId,
        actorEmail: r.actorId ? (emails.get(r.actorId) ?? null) : null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        ip: r.ip,
      })),
      nextCursor: rows.length > q.limit && last ? encode(last.at, last.id) : null,
    };
  }
}
