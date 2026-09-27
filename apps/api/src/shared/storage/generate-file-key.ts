import { randomUUID } from "node:crypto";

/** Server-generated, never derived from the user's file name (ADR-0005 —
 * prevents path traversal). */
export function generateFileKey(companyId: string, entity: string): string {
  return `${companyId}/${entity}/${randomUUID()}`;
}
