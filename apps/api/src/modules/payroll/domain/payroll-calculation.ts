/**
 * Monthly pay for one employee (business-rules.md "Payroll"). Pure: integer halalas (bigint) only, no clock,
 * no framework. Owner defaults 2026-10-01 (all settings): a 30-day month for pro-rating and daily rates;
 * absence = (basic + housing) / 30 per day; lateness per minute of the (basic + housing) daily rate over the
 * schedule's length — the schedule's grace is already excluded from late minutes; unpaid leave and the unpaid
 * part of tiered (sick) leave on the full daily wage; GOSI on basic + housing up to a cap.
 */

export interface PayComponents {
  basic: bigint;
  housing: bigint;
  transport: bigint;
  other: bigint;
}

export interface PayInput {
  /** Monthly amounts in force for the period. */
  components: PayComponents;
  /** Calendar days in the month and how many of them the employee was employed. */
  periodDays: number;
  employedDays: number;
  absentDays: number;
  lateMinutes: number;
  /** Length of the employee's scheduled day (minutes) — the per-minute rate's divisor. */
  dayMinutes: number;
  unpaidLeaveDays: number;
  /** Pay percent of each day of tiered leave (e.g. sick leave 100 / 75 / 0). */
  tieredLeavePercents: number[];
  /** Approved adjustments for the period. */
  additions: bigint;
  deductions: bigint;
  gosi: { employeePercent: number; employerPercent: number; baseCap: bigint };
  policy: { absenceIncludesHousing: boolean; latenessDeduction: boolean; maxDeductionPercent: number };
}

export interface PayResult {
  paidDays: number;
  basic: bigint;
  housing: bigint;
  transport: bigint;
  other: bigint;
  gross: bigint;
  absence: bigint;
  lateness: bigint;
  unpaidLeave: bigint;
  tieredLeave: bigint;
  additions: bigint;
  deductions: bigint;
  gosiBase: bigint;
  gosiEmployee: bigint;
  gosiEmployer: bigint;
  net: bigint;
  warnings: Array<"negative_net" | "over_deduction_cap" | "no_salary">;
}

/** a × num ÷ den, rounded half up (non-negative inputs). */
export function mulDiv(a: bigint, num: bigint | number, den: bigint | number): bigint {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) return 0n;
  return (a * n * 2n + d) / (2n * d);
}

/** Percent (may have decimals, e.g. 9.75) as basis points. */
const bp = (percent: number): bigint => BigInt(Math.round(percent * 100));

/** 30-day month: a full month is 30 paid days whatever its length; a partial one counts calendar days, max 30. */
export function paidDaysOf(periodDays: number, employedDays: number): number {
  if (employedDays <= 0) return 0;
  return employedDays >= periodDays ? 30 : Math.min(30, employedDays);
}

export function calculatePay(input: PayInput): PayResult {
  const c = input.components;
  const paidDays = paidDaysOf(input.periodDays, input.employedDays);
  const basic = mulDiv(c.basic, paidDays, 30);
  const housing = mulDiv(c.housing, paidDays, 30);
  const transport = mulDiv(c.transport, paidDays, 30);
  const other = mulDiv(c.other, paidDays, 30);
  const gross = basic + housing + transport + other;

  const monthlyWage = c.basic + c.housing + c.transport + c.other;
  const absenceBase = input.policy.absenceIncludesHousing ? c.basic + c.housing : c.basic;
  const absence = mulDiv(absenceBase, input.absentDays, 30);
  const lateness =
    input.policy.latenessDeduction && input.dayMinutes > 0 && input.lateMinutes > 0 ? mulDiv(absenceBase, input.lateMinutes, 30 * input.dayMinutes) : 0n;
  const unpaidLeave = mulDiv(monthlyWage, input.unpaidLeaveDays, 30);
  const unpaidPercentDays = input.tieredLeavePercents.reduce((sum, p) => sum + (100 - Math.min(100, Math.max(0, p))), 0);
  const tieredLeave = mulDiv(monthlyWage, unpaidPercentDays, 3000);

  const contributory = c.basic + c.housing;
  const gosiBase = paidDays === 0 ? 0n : contributory < input.gosi.baseCap ? contributory : input.gosi.baseCap;
  const gosiEmployee = mulDiv(gosiBase, bp(input.gosi.employeePercent), 10_000);
  const gosiEmployer = mulDiv(gosiBase, bp(input.gosi.employerPercent), 10_000);

  const net = gross + input.additions - absence - lateness - unpaidLeave - tieredLeave - input.deductions - gosiEmployee;

  const warnings: PayResult["warnings"] = [];
  if (monthlyWage === 0n) warnings.push("no_salary");
  if (net < 0n) warnings.push("negative_net");
  // Deductions the employer takes (not GOSI, not unpaid time) against the legal cap of the month's pay.
  const capped = absence + lateness + input.deductions;
  if (gross > 0n && capped > mulDiv(gross, bp(input.policy.maxDeductionPercent), 10_000)) warnings.push("over_deduction_cap");

  return {
    paidDays,
    basic,
    housing,
    transport,
    other,
    gross,
    absence,
    lateness,
    unpaidLeave,
    tieredLeave,
    additions: input.additions,
    deductions: input.deductions,
    gosiBase,
    gosiEmployee,
    gosiEmployer,
    net,
    warnings,
  };
}

/** Calendar days of [from, to] (inclusive, UTC dates) that fall inside the employment [hire, end]. */
export function employedDaysIn(from: Date, to: Date, hire: Date, end: Date | null): number {
  const start = Math.max(from.getTime(), hire.getTime());
  const stop = Math.min(to.getTime(), end ? end.getTime() : to.getTime());
  return stop < start ? 0 : Math.round((stop - start) / 86_400_000) + 1;
}
