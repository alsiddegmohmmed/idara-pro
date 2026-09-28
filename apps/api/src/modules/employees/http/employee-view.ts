import type { Employee, EmployeeDocument } from "@prisma/client";
import { maskIban } from "@idara-pro/shared";

/**
 * IBAN is shown in full only to the employee themselves and to employees:review
 * holders; every other employees:read response gets it masked
 * (docs/domain/business-rules.md "Employee onboarding").
 */
export function toEmployeeView(employee: Employee, canSeeFullIban: boolean): Employee {
  if (canSeeFullIban) return employee;
  return { ...employee, iban: maskIban(employee.iban), pendingIban: maskIban(employee.pendingIban) };
}

/** The storage key is an internal detail — never sent to a browser. */
export function toDocumentView(document: EmployeeDocument): Omit<EmployeeDocument, "fileKey"> {
  const { fileKey, ...rest } = document;
  void fileKey;
  return rest;
}
