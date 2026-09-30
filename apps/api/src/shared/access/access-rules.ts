import { ROLE_SCOPES, type BranchMode, type RoleScope } from "@idara-pro/shared";

/**
 * Pure access rules (ADR-0011 §1–2). No Nest, no Prisma, no clock: the loader hands in plain rows and
 * "today", these functions turn them into what a user may reach.
 */

/** Where one permission reaches for one user, after the union of all their active assignments. */
export interface Grant {
  company: boolean;
  /** Branches reached through branch-reach grants (home branch or selected branches). */
  branchIds: string[];
  /** Direct and indirect reports. */
  team: boolean;
  /** The user's own employee record. */
  own: boolean;
}

/** Everything the guard and the services need to decide access, cached per user (ADR-0011 §4). */
export interface AccessSnapshot {
  userId: string;
  companyId: string;
  /** The employee record linked to the login; null for an admin account without one. */
  employeeId: string | null;
  homeBranchId: string | null;
  /** Direct and indirect reports of employeeId (manager chain, depth ≤ 6). */
  teamIds: string[];
  grants: Record<string, Grant>;
}

/**
 * The records a user may touch for one permission. `all` = every record of the company; otherwise a record
 * is in scope when its branch is in `branchIds` OR its employee is in `employeeIds` (self and/or team).
 */
export type DataScope = { all: true } | { all: false; branchIds: string[]; employeeIds: string[] };

/** What a scope is checked against: an employee, or a time-bound record with its own branch snapshot. */
export interface ScopeTarget {
  employeeId: string;
  branchId: string | null;
}

export interface AssignmentRow {
  branchMode: BranchMode;
  selectedBranchIds: string[];
  /** Company dates (UTC midnight), inclusive; null = open-ended. */
  validFrom: Date | null;
  validTo: Date | null;
  grants: Array<{ code: string; scope: string }>;
}

export const TEAM_MAX_DEPTH = 6;

/** Temporary cover is a dated assignment (ADR-0011 §6.5): outside its dates it grants nothing. */
export function isAssignmentActive(a: Pick<AssignmentRow, "validFrom" | "validTo">, today: Date): boolean {
  if (a.validFrom && a.validFrom.getTime() > today.getTime()) return false;
  if (a.validTo && a.validTo.getTime() < today.getTime()) return false;
  return true;
}

function isRoleScope(value: string): value is RoleScope {
  return (ROLE_SCOPES as readonly string[]).includes(value);
}

/** Union of every active assignment's grants (ADR-0011 §6.2: one person, many roles). */
export function buildGrants(assignments: AssignmentRow[], homeBranchId: string | null, today: Date): Record<string, Grant> {
  const grants: Record<string, Grant> = {};
  for (const a of assignments) {
    if (!isAssignmentActive(a, today)) continue;
    const branches = a.branchMode === "selected" ? a.selectedBranchIds : homeBranchId ? [homeBranchId] : [];
    for (const { code, scope } of a.grants) {
      if (!isRoleScope(scope)) continue; // an unknown reach grants nothing (fail closed)
      const g = (grants[code] ??= { company: false, branchIds: [], team: false, own: false });
      if (scope === "company") g.company = true;
      else if (scope === "branch") g.branchIds = [...new Set([...g.branchIds, ...branches])];
      else if (scope === "team") g.team = true;
      else g.own = true;
    }
  }
  return grants;
}

/** The DataScope for one permission, or null when the user doesn't hold it at all. */
export function scopeFor(snapshot: AccessSnapshot, code: string): DataScope | null {
  const g = snapshot.grants[code];
  if (!g) return null;
  if (g.company) return { all: true };
  const employeeIds = new Set<string>();
  if (g.own && snapshot.employeeId) employeeIds.add(snapshot.employeeId);
  if (g.team) for (const id of snapshot.teamIds) employeeIds.add(id);
  return { all: false, branchIds: [...g.branchIds], employeeIds: [...employeeIds] };
}

export function scopeCovers(scope: DataScope | null, target: ScopeTarget): boolean {
  if (!scope) return false;
  if (scope.all) return true;
  return (target.branchId !== null && scope.branchIds.includes(target.branchId)) || scope.employeeIds.includes(target.employeeId);
}

/** The widest reach of a grant, for the web app's show/hide decisions (GET /auth/access). */
export function widestReach(g: Grant): RoleScope {
  if (g.company) return "company";
  if (g.branchIds.length > 0) return "branch";
  if (g.team) return "team";
  return "own";
}

/** Permissions about the company itself or the user's own account, not about employees' data. */
const NOT_EMPLOYEE_DATA = ["org:", "access:", "audit:", "notifications:"];

/** The branches whose people a user reaches with any permission; `all` when one of those grants is company-wide. */
export function reachableBranches(snapshot: AccessSnapshot): { all: true } | { all: false; branchIds: string[] } {
  const ids = new Set<string>();
  for (const [code, g] of Object.entries(snapshot.grants)) {
    if (NOT_EMPLOYEE_DATA.some((prefix) => code.startsWith(prefix))) continue;
    if (g.company) return { all: true };
    for (const id of g.branchIds) ids.add(id);
  }
  return { all: false, branchIds: [...ids] };
}
