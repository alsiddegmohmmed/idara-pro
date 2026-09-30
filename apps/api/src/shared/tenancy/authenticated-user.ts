import type { AccessSnapshot } from "../access/access-rules";

/** Attached to the request by JwtAuthGuard — the request context AGENTS.md §3 rule 1 means when it says
 * companyId comes "from the JWT, never the body". `access` is the live snapshot (ADR-0011 §4), not token claims. */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  /** Codes the user holds at any reach — for "may call this endpoint at all" checks. */
  permissions: string[];
  access: AccessSnapshot;
}
