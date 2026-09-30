import type { Employee, EmployeeDocument } from "@prisma/client";
import { maskIban } from "@idara-pro/shared";

const maskTail = (value: string): string => (value.length <= 4 ? "••••" : `••••${value.slice(-4)}`);

/**
 * Personal tier (ADR-0011 §3): national ID, birth date, marital status, personal phones/email, address and IBAN are sent
 * only to holders of employees:read-sensitive whose reach covers the employee, and to the employee
 * themself (/me). Everyone else gets them masked or omitted — by the API, never just hidden in the UI.
 */
export function toEmployeeView(employee: Employee, canSeeSensitive: boolean): Employee {
  if (canSeeSensitive) return employee;
  return {
    ...employee,
    nationalId: maskTail(employee.nationalId),
    phone: null,
    personalEmail: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    additionalPhone: null,
    birthDate: null,
    maritalStatus: null,
    iban: maskIban(employee.iban),
    pendingIban: maskIban(employee.pendingIban),
    ibanReviewReason: null,
  };
}

/** The storage key is an internal detail — never sent to a browser. */
export function toDocumentView(document: EmployeeDocument): Omit<EmployeeDocument, "fileKey"> {
  const { fileKey, ...rest } = document;
  void fileKey;
  return rest;
}
