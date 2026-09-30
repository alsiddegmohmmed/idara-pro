import { BusinessRuleError } from "../../../shared/errors/errors";

/**
 * The legal cap on deductions (business-rules.md "Adjustments"): approved deductions of a month may not exceed
 * `capPercent` of that month's pay. Integer halalas only (AGENTS.md rule 3).
 */
export function assertWithinDeductionCap(monthlyPay: bigint, alreadyDeducted: bigint, adding: bigint, capPercent: number): void {
  if (monthlyPay <= 0n) throw new BusinessRuleError("adjustments.no_salary", "No salary is on file for this month, so the deduction cap can't be checked");
  const cap = (monthlyPay * BigInt(Math.round(capPercent * 100))) / 10_000n;
  if (alreadyDeducted + adding > cap) {
    throw new BusinessRuleError("adjustments.over_cap", "This would exceed the monthly deduction limit", {
      capHalalas: cap.toString(),
      alreadyHalalas: alreadyDeducted.toString(),
    });
  }
}

/** Adjustments may target the previous month (late corrections) or any later month, never older. */
export function assertPeriodOpen(period: string, currentMonth: string): void {
  const [y, m] = currentMonth.split("-").map(Number);
  const previous = new Date(Date.UTC(y ?? 0, (m ?? 1) - 2, 1)).toISOString().slice(0, 7);
  if (period < previous) throw new BusinessRuleError("adjustments.period_closed", "That month is closed for adjustments");
}
