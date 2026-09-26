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
