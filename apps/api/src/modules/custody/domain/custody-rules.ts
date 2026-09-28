import type { CustodyStatus } from "@idara-pro/shared";

/** business-rules.md "Custody": requested → approved | rejected | cancelled, approved → paid, paid → settled. */
const TRANSITIONS: Record<CustodyStatus, CustodyStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["paid"],
  paid: ["settled"],
  rejected: [],
  cancelled: [],
  settled: [],
};

export function canTransition(from: CustodyStatus, to: CustodyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The settled (returned/justified) amount may be less than what was paid, never more. */
export function settlementError(paidHalalas: bigint, settledHalalas: bigint): "exceeds_paid" | null {
  return settledHalalas > paidHalalas ? "exceeds_paid" : null;
}
