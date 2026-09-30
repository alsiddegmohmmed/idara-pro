import type { Prisma } from "@prisma/client";
import type { DataScope } from "./access-rules";

/**
 * A DataScope as a Prisma filter on `employees` (ADR-0011 §2): branch in the scope's branches OR the
 * employee is one of the scope's people. An empty scope matches nothing (fail closed).
 */
export function employeeScopeWhere(scope: DataScope): Prisma.EmployeeWhereInput {
  if (scope.all) return {};
  return { OR: [{ branchId: { in: scope.branchIds } }, { id: { in: scope.employeeIds } }] };
}

type RecordScopeWhere = { OR: Array<{ branchId: { in: string[] } } | { employeeId: { in: string[] } }> } | Record<string, never>;

/**
 * A DataScope as a filter on a time-bound record carrying a branch snapshot (ADR-0012: attendance days,
 * leave and custody requests): the record's own branch in scope OR its employee is one of the scope's people.
 * A record filed in branch A stays with A's approvers after the employee moves to B.
 */
export function recordScopeWhere(scope: DataScope): RecordScopeWhere {
  if (scope.all) return {};
  return { OR: [{ branchId: { in: scope.branchIds } }, { employeeId: { in: scope.employeeIds } }] };
}

/** Every company employee — for whole-company system jobs only (nightly attendance close), never a request. */
export const SYSTEM_JOB_SCOPE: DataScope = { all: true };
