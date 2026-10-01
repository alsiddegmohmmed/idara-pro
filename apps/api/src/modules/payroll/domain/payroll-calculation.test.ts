import { describe, expect, it } from "vitest";
import { calculatePay, employedDaysIn, mulDiv, paidDaysOf, type PayInput } from "./payroll-calculation";

const SAR = (n: number): bigint => BigInt(Math.round(n * 100));
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Basic 6,000 + housing 1,500 + transport 500 = 8,000 SAR; a Saudi on 9.75% / 11.75% GOSI, cap 45,000. */
const base = (over: Partial<PayInput> = {}): PayInput => ({
  components: { basic: SAR(6000), housing: SAR(1500), transport: SAR(500), other: 0n },
  periodDays: 31,
  employedDays: 31,
  absentDays: 0,
  lateMinutes: 0,
  dayMinutes: 480,
  unpaidLeaveDays: 0,
  tieredLeavePercents: [],
  additions: 0n,
  deductions: 0n,
  gosi: { employeePercent: 9.75, employerPercent: 11.75, baseCap: SAR(45000) },
  policy: { absenceIncludesHousing: true, latenessDeduction: true, maxDeductionPercent: 50 },
  ...over,
});

describe("payroll calculation", () => {
  it("pays a full month as 30 days whatever its length, with GOSI on basic + housing", () => {
    const r = calculatePay(base());
    expect(r.paidDays).toBe(30);
    expect(r.gross).toBe(SAR(8000));
    expect(r.gosiBase).toBe(SAR(7500));
    expect(r.gosiEmployee).toBe(SAR(731.25)); // 9.75% of 7,500
    expect(r.gosiEmployer).toBe(SAR(881.25)); // 11.75% of 7,500
    expect(r.net).toBe(SAR(8000 - 731.25));
  });

  it("treats February in full as 30 paid days too", () => {
    expect(paidDaysOf(28, 28)).toBe(30);
    expect(paidDaysOf(31, 31)).toBe(30);
  });

  it("pro-rates a joiner by calendar days employed (hired on the 21st of a 30-day month = 10 days)", () => {
    const days = employedDaysIn(d("2026-09-01"), d("2026-09-30"), d("2026-09-21"), null);
    expect(days).toBe(10);
    const r = calculatePay(base({ periodDays: 30, employedDays: days }));
    expect(r.paidDays).toBe(10);
    expect(r.basic).toBe(SAR(2000));
    expect(r.gross).toBe(SAR(2000) + SAR(500) + SAR(166.67)); // each component rounded to the halala
  });

  it("counts a leaver up to and including the last day", () => {
    expect(employedDaysIn(d("2026-10-01"), d("2026-10-31"), d("2020-01-01"), d("2026-10-15"))).toBe(15);
    expect(employedDaysIn(d("2026-10-01"), d("2026-10-31"), d("2020-01-01"), d("2026-09-30"))).toBe(0);
  });

  it("deducts an absent day at (basic + housing) / 30", () => {
    const r = calculatePay(base({ absentDays: 2 }));
    expect(r.absence).toBe(SAR(500)); // 7,500 / 30 × 2
  });

  it("deducts lateness per minute of the (basic + housing) daily rate over an 8-hour day", () => {
    const r = calculatePay(base({ lateMinutes: 48 }));
    expect(r.lateness).toBe(SAR(25)); // 250 per day / 480 × 48
  });

  it("does not deduct lateness when the policy is off", () => {
    expect(calculatePay(base({ lateMinutes: 48, policy: { absenceIncludesHousing: true, latenessDeduction: false, maxDeductionPercent: 50 } })).lateness).toBe(0n);
  });

  it("deducts unpaid leave on the full daily wage and the unpaid part of sick leave", () => {
    const r = calculatePay(base({ unpaidLeaveDays: 3, tieredLeavePercents: [100, 75, 75, 0] }));
    expect(r.unpaidLeave).toBe(SAR(800)); // 8,000 / 30 × 3
    expect(r.tieredLeave).toBe(mulDiv(SAR(8000), 150, 3000)); // 0.25 + 0.25 + 1 day = 1.5 days → 400
    expect(r.tieredLeave).toBe(SAR(400));
  });

  it("adds approved bonuses and subtracts approved deductions", () => {
    const r = calculatePay(base({ additions: SAR(1000), deductions: SAR(200) }));
    expect(r.net).toBe(SAR(8000 + 1000 - 200 - 731.25));
  });

  it("caps the GOSI base", () => {
    const r = calculatePay(base({ components: { basic: SAR(50000), housing: SAR(10000), transport: 0n, other: 0n } }));
    expect(r.gosiBase).toBe(SAR(45000));
  });

  it("charges a non-Saudi employer share only", () => {
    const r = calculatePay(base({ gosi: { employeePercent: 0, employerPercent: 2, baseCap: SAR(45000) } }));
    expect(r.gosiEmployee).toBe(0n);
    expect(r.gosiEmployer).toBe(SAR(150));
  });

  it("flags deductions over the cap and a negative net", () => {
    const r = calculatePay(base({ deductions: SAR(9000) }));
    expect(r.warnings).toContain("over_deduction_cap");
    expect(r.warnings).toContain("negative_net");
  });

  it("rounds halalas half up", () => {
    expect(mulDiv(100n, 1n, 3n)).toBe(33n);
    expect(mulDiv(200n, 1n, 3n)).toBe(67n);
  });
});
