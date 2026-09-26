/** Attached to the request by JwtAuthGuard — the request context AGENTS.md §3
 * rule 1 means when it says companyId comes "from the JWT, never the body". */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  permissions: string[];
}
