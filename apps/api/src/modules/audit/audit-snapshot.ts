/** Converts a Prisma model instance into a JSON-safe snapshot for
 * AuditService's before/after fields (Date -> ISO string, etc). */
export function toAuditSnapshot(entity: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(entity)) as Record<string, unknown>;
}
