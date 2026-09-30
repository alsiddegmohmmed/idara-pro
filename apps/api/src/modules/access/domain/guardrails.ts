import { ROLE_SCOPES, type RoleScope } from "@idara-pro/shared";
import type { Grant } from "../../../shared/access/access-rules";
import { widestReach } from "../../../shared/access/access-rules";
import { BusinessRuleError, ForbiddenError } from "../../../shared/errors/errors";

/** ADR-0011 §5 guardrails, pure. `actorGrants` is the acting user's snapshot grants. */

const rank = (s: RoleScope): number => ROLE_SCOPES.indexOf(s);

/**
 * No privilege escalation: you can only hand out a permission at a reach you hold yourself.
 * `branches` = the branches a branch-reach grant would apply to (an assignment's selected branches or the
 * holder's home branch); undefined when defining a role, where only the reach is compared.
 */
export function assertGrantable(
  actorGrants: Record<string, Grant>,
  grants: Array<{ code: string; scope: RoleScope }>,
  branches?: string[],
): void {
  for (const { code, scope } of grants) {
    const mine = actorGrants[code];
    const ok =
      mine !== undefined &&
      rank(widestReach(mine)) >= rank(scope) &&
      (scope !== "branch" || mine.company || branches === undefined || branches.every((b) => mine.branchIds.includes(b)));
    if (!ok) {
      throw new ForbiddenError(`You cannot grant ${code} at ${scope} reach`, "access.escalation");
    }
  }
}

/** Nobody changes their own access. */
export function assertNotSelf(actorId: string, userId: string): void {
  if (actorId === userId) throw new ForbiddenError("You cannot change your own access", "access.own_access");
}

/** The company must always keep at least one active Super admin. */
export function assertKeepsSuperAdmin(remainingSuperAdmins: number): void {
  if (remainingSuperAdmins < 1) {
    throw new BusinessRuleError("access.last_super_admin", "The last Super admin cannot be removed");
  }
}
