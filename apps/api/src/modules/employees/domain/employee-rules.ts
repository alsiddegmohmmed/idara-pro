import { BusinessRuleError } from "../../../shared/errors/errors";

/** Pure business rules — no framework imports (docs/architecture/overview.md). */

export function assertValidEmployeeDates(hireDate: Date, endDate: Date | null | undefined): void {
  if (endDate && hireDate > endDate) {
    throw new BusinessRuleError("employees.invalid_date_range", "hireDate must not be after endDate");
  }
}

export function assertManagerNotSelf(employeeId: string, managerId: string | null | undefined): void {
  if (managerId === employeeId) {
    throw new BusinessRuleError("employees.manager_is_self", "An employee cannot be their own manager");
  }
}

export function assertParentNotSelf(departmentId: string, parentId: string | null | undefined): void {
  if (parentId === departmentId) {
    throw new BusinessRuleError("employees.department_parent_is_self", "A department cannot be its own parent");
  }
}

export function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? new Date(8640000000000000); // open-ended = far future
  const bEnd = bTo ?? new Date(8640000000000000);
  return aFrom <= bEnd && bFrom <= aEnd;
}

export function assertValidDocumentDates(issueDate: Date | null, expiryDate: Date | null): void {
  if (issueDate && expiryDate && issueDate > expiryDate) {
    throw new BusinessRuleError("employees.document.invalid_date_range", "issueDate must not be after expiryDate");
  }
}
