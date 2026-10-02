/**
 * Demo data for trying the platform: ONE branch, departments, a work schedule, holidays, ~28 employees with full
 * files (salary, contract, insurance, contacts), a login for each (by national ID / iqama number), roles for every
 * kind of user, and about a month of activity (attendance, leave, short permissions, custody, warnings, adjustments).
 *
 * Writes into the database in DATABASE_URL — the same one the app uses. Run after `pnpm db:seed`:
 *   pnpm db:seed:demo
 * Safe to run twice: it stops if the demo accounts already exist. Every demo login uses DEMO_PASSWORD.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, type Employee } from "@prisma/client";
import Redis from "ioredis";
import {
  ACCOUNTANT_ROLE_ID,
  BRANCH_HR_ROLE_ID,
  EMPLOYEE_ROLE_ID,
  EXECUTIVE_ROLE_ID,
  HR_ADMIN_ROLE_ID,
  MANAGER_ROLE_ID,
  TEAM_LEAD_ROLE_ID,
} from "../src/shared/access/system-roles";
import { hashPassword } from "../src/shared/auth/password";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const prisma = new PrismaClient();
const COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_PASSWORD = "Demo@12345";
const EMAIL_DOMAIN = "demo.idara.local";
const DAY = 86_400_000;

// ---------- small helpers ----------

/** Deterministic random numbers, so every run produces the same demo. */
let seed = 20261001;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const between = (min: number, max: number): number => Math.floor(min + rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

/** Today's date in Riyadh as a UTC-midnight Date (how work days are stored). */
const todayRiyadh = (): Date => {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
};
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
/** A local Riyadh time (UTC+3, no DST) on a work date, as an instant. */
const at = (workDate: Date, hh: number, mm: number): Date => new Date(workDate.getTime() + ((hh - 3) * 60 + mm) * 60_000);
const sar = (n: number): bigint => BigInt(Math.round(n * 100));

/** A valid Saudi IBAN (SA + 2 check digits + 2-digit bank code + 18-digit account). */
function iban(bank: string, account: string): string {
  const bban = `${bank}${account.padStart(20, "0")}`;
  const numeric = `${bban}SA00`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  const check = 98n - (BigInt(numeric) % 97n);
  return `SA${String(check).padStart(2, "0")}${bban}`;
}

// ---------- the people ----------

type Role = "executive" | "hr_admin" | "branch_hr" | "accountant" | "manager" | "team_lead" | "employee";
interface Person {
  key: string;
  ar: string;
  en: string;
  gender: "male" | "female";
  nationality: string;
  job: string;
  dept: string;
  manager: string | null;
  role: Role;
  basic: number;
  /** Months since hire (fractions allowed). */
  hiredMonthsAgo: number;
}

const PEOPLE: Person[] = [
  { key: "gm", ar: "عبدالله محمد العتيبي", en: "Abdullah Mohammed Alotaibi", gender: "male", nationality: "SA", job: "المدير العام", dept: "admin", manager: null, role: "executive", basic: 30000, hiredMonthsAgo: 60 },
  { key: "hrm", ar: "نورة سعد القحطاني", en: "Noura Saad Alqahtani", gender: "female", nationality: "SA", job: "مديرة الموارد البشرية", dept: "hr", manager: "gm", role: "hr_admin", basic: 18000, hiredMonthsAgo: 48 },
  { key: "hrs", ar: "ريم خالد الشهري", en: "Reem Khalid Alshehri", gender: "female", nationality: "SA", job: "أخصائية موارد بشرية", dept: "hr", manager: "hrm", role: "branch_hr", basic: 9000, hiredMonthsAgo: 20 },
  { key: "acc", ar: "محمد أحمد عبدالرحمن", en: "Mohamed Ahmed Abdelrahman", gender: "male", nationality: "EG", job: "محاسب أول", dept: "finance", manager: "gm", role: "accountant", basic: 11000, hiredMonthsAgo: 36 },
  { key: "bm", ar: "فهد عبدالعزيز الدوسري", en: "Fahad Abdulaziz Aldosari", gender: "male", nationality: "SA", job: "مدير الفرع", dept: "ops", manager: "gm", role: "manager", basic: 16000, hiredMonthsAgo: 40 },
  { key: "salesLead", ar: "سلطان ناصر الحربي", en: "Sultan Nasser Alharbi", gender: "male", nationality: "SA", job: "مشرف المبيعات", dept: "sales", manager: "bm", role: "team_lead", basic: 10000, hiredMonthsAgo: 30 },
  { key: "opsLead", ar: "أحمد عثمان الطيب", en: "Ahmed Osman Altayeb", gender: "male", nationality: "SD", job: "مشرف العمليات", dept: "ops", manager: "bm", role: "team_lead", basic: 9500, hiredMonthsAgo: 34 },
  { key: "csLead", ar: "هيفاء علي الزهراني", en: "Haifa Ali Alzahrani", gender: "female", nationality: "SA", job: "مشرفة خدمة العملاء", dept: "cs", manager: "bm", role: "team_lead", basic: 9000, hiredMonthsAgo: 26 },
  { key: "itLead", ar: "راجيش كومار", en: "Rajesh Kumar", gender: "male", nationality: "IN", job: "مسؤول تقنية المعلومات", dept: "it", manager: "gm", role: "team_lead", basic: 10500, hiredMonthsAgo: 28 },
  { key: "s1", ar: "خالد سعيد الغامدي", en: "Khalid Saeed Alghamdi", gender: "male", nationality: "SA", job: "مندوب مبيعات", dept: "sales", manager: "salesLead", role: "employee", basic: 6500, hiredMonthsAgo: 18 },
  { key: "s2", ar: "يوسف إبراهيم المالكي", en: "Yousef Ibrahim Almalki", gender: "male", nationality: "SA", job: "مندوب مبيعات", dept: "sales", manager: "salesLead", role: "employee", basic: 6000, hiredMonthsAgo: 9 },
  { key: "s3", ar: "عمر حسن البنا", en: "Omar Hassan Albanna", gender: "male", nationality: "EG", job: "مندوب مبيعات", dept: "sales", manager: "salesLead", role: "employee", basic: 5500, hiredMonthsAgo: 14 },
  { key: "s4", ar: "سارة عبدالله السبيعي", en: "Sarah Abdullah Alsubaie", gender: "female", nationality: "SA", job: "منسقة مبيعات", dept: "sales", manager: "salesLead", role: "employee", basic: 6000, hiredMonthsAgo: 2 },
  { key: "s5", ar: "محمد إقبال", en: "Muhammad Iqbal", gender: "male", nationality: "PK", job: "مندوب مبيعات", dept: "sales", manager: "salesLead", role: "employee", basic: 4500, hiredMonthsAgo: 22 },
  { key: "o1", ar: "عصام الدين يوسف", en: "Esameldin Yousif", gender: "male", nationality: "SD", job: "فني تشغيل", dept: "ops", manager: "opsLead", role: "employee", basic: 4800, hiredMonthsAgo: 25 },
  { key: "o2", ar: "مارك أنتوني ريس", en: "Mark Anthony Reyes", gender: "male", nationality: "PH", job: "فني صيانة", dept: "ops", manager: "opsLead", role: "employee", basic: 4200, hiredMonthsAgo: 16 },
  { key: "o3", ar: "سعيد عبده الحمادي", en: "Saeed Abdo Alhammadi", gender: "male", nationality: "YE", job: "أمين مستودع", dept: "ops", manager: "opsLead", role: "employee", basic: 4000, hiredMonthsAgo: 30 },
  { key: "o4", ar: "تركي فيصل العنزي", en: "Turki Faisal Alanazi", gender: "male", nationality: "SA", job: "مشرف وردية", dept: "ops", manager: "opsLead", role: "employee", basic: 7000, hiredMonthsAgo: 11 },
  { key: "o5", ar: "أنيل شارما", en: "Anil Sharma", gender: "male", nationality: "IN", job: "سائق", dept: "ops", manager: "opsLead", role: "employee", basic: 3500, hiredMonthsAgo: 40 },
  { key: "o6", ar: "بلال أحمد خان", en: "Bilal Ahmed Khan", gender: "male", nationality: "PK", job: "فني تشغيل", dept: "ops", manager: "opsLead", role: "employee", basic: 3800, hiredMonthsAgo: 1.5 },
  { key: "c1", ar: "منى عبدالرحمن العمري", en: "Mona Abdulrahman Alomari", gender: "female", nationality: "SA", job: "موظفة خدمة عملاء", dept: "cs", manager: "csLead", role: "employee", basic: 5500, hiredMonthsAgo: 13 },
  { key: "c2", ar: "لمى ماجد الرشيد", en: "Lama Majed Alrasheed", gender: "female", nationality: "SA", job: "موظفة خدمة عملاء", dept: "cs", manager: "csLead", role: "employee", basic: 5500, hiredMonthsAgo: 7 },
  { key: "c3", ar: "دينا مصطفى كامل", en: "Dina Mostafa Kamel", gender: "female", nationality: "EG", job: "موظفة خدمة عملاء", dept: "cs", manager: "csLead", role: "employee", basic: 5000, hiredMonthsAgo: 19 },
  { key: "c4", ar: "عبدالرحمن صالح اليامي", en: "Abdulrahman Saleh Alyami", gender: "male", nationality: "SA", job: "موظف استقبال", dept: "cs", manager: "csLead", role: "employee", basic: 5000, hiredMonthsAgo: 0.7 },
  { key: "f1", ar: "أسماء حسين الجعفري", en: "Asmaa Hussein Aljaafari", gender: "female", nationality: "SA", job: "محاسبة", dept: "finance", manager: "acc", role: "employee", basic: 7500, hiredMonthsAgo: 15 },
  { key: "h1", ar: "جوري فهد المطيري", en: "Jouri Fahad Almutairi", gender: "female", nationality: "SA", job: "منسقة موارد بشرية", dept: "hr", manager: "hrm", role: "employee", basic: 6500, hiredMonthsAgo: 10 },
  { key: "t1", ar: "أحمد محمود السيد", en: "Ahmed Mahmoud Elsayed", gender: "male", nationality: "EG", job: "مطور برمجيات", dept: "it", manager: "itLead", role: "employee", basic: 9000, hiredMonthsAgo: 17 },
  { key: "t2", ar: "مازن عمر باعشن", en: "Mazen Omar Baeshen", gender: "male", nationality: "SA", job: "فني دعم تقني", dept: "it", manager: "itLead", role: "employee", basic: 6000, hiredMonthsAgo: 8 },
];

const DEPARTMENTS: Record<string, string> = {
  admin: "الإدارة العامة",
  hr: "الموارد البشرية",
  finance: "المالية والمحاسبة",
  sales: "المبيعات",
  ops: "العمليات",
  cs: "خدمة العملاء",
  it: "تقنية المعلومات",
};

const ROLE_IDS: Record<Exclude<Role, "employee">, string> = {
  executive: EXECUTIVE_ROLE_ID,
  hr_admin: HR_ADMIN_ROLE_ID,
  branch_hr: BRANCH_HR_ROLE_ID,
  accountant: ACCOUNTANT_ROLE_ID,
  manager: MANAGER_ROLE_ID,
  team_lead: TEAM_LEAD_ROLE_ID,
};

const ROLE_NAMES: Record<Role, string> = {
  executive: "الإدارة العليا (اطلاع على كل شيء)",
  hr_admin: "مسؤول الموارد البشرية",
  branch_hr: "موارد بشرية - فرع",
  accountant: "المحاسب",
  manager: "مدير الفرع",
  team_lead: "قائد فريق",
  employee: "موظف",
};

async function main(): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) throw new Error("Run `pnpm db:seed` first — the company and roles don't exist yet.");
  if (await prisma.user.findFirst({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } })) {
    console.log("Demo data is already in this database — nothing to do.");
    return;
  }

  const admin = await prisma.user.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: "asc" } });
  const createdBy = admin?.id ?? null;
  const today = todayRiyadh();
  const year = today.getUTCFullYear();
  const period = iso(today).slice(0, 7);

  // ---------- organisation: one branch, schedule, departments, holidays ----------
  const schedule =
    (await prisma.workSchedule.findFirst({ where: { companyId: COMPANY_ID } })) ??
    (await prisma.workSchedule.create({
      data: { companyId: COMPANY_ID, name: "الدوام الصباحي", startTime: "08:00", endTime: "16:00", lateGraceMin: 15, workDays: [0, 1, 2, 3, 4], createdBy },
    }));
  const existingBranch = await prisma.branch.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: "asc" } });
  const branch =
    existingBranch ??
    (await prisma.branch.create({
      data: { companyId: COMPANY_ID, name: "الفرع الرئيسي - الرياض", lat: 24.7136, lng: 46.6753, radiusM: 200, defaultScheduleId: schedule.id, createdBy },
    }));
  if (!branch.defaultScheduleId) await prisma.branch.update({ where: { id: branch.id }, data: { defaultScheduleId: schedule.id } });

  const deptIds: Record<string, string> = {};
  for (const [key, name] of Object.entries(DEPARTMENTS)) {
    const found = await prisma.department.findFirst({ where: { companyId: COMPANY_ID, name } });
    deptIds[key] = (found ?? (await prisma.department.create({ data: { companyId: COMPANY_ID, name, createdBy } }))).id;
  }

  const holidays: Array<[string, string]> = [
    [`${year}-02-22`, "يوم التأسيس"],
    [`${year}-09-23`, "اليوم الوطني"],
  ];
  for (const [date, name] of holidays) {
    const d = new Date(`${date}T00:00:00.000Z`);
    if (!(await prisma.holiday.findFirst({ where: { companyId: COMPANY_ID, date: d } }))) {
      await prisma.holiday.create({ data: { companyId: COMPANY_ID, date: d, name, paid: true, createdBy } });
    }
  }
  const holidaySet = new Set((await prisma.holiday.findMany({ where: { companyId: COMPANY_ID } })).map((h) => iso(h.date)));
  const isWorkingDay = (d: Date): boolean => [0, 1, 2, 3, 4].includes(d.getUTCDay()) && !holidaySet.has(iso(d));

  // ---------- employees, accounts, roles ----------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const used = new Set((await prisma.employee.findMany({ where: { companyId: COMPANY_ID }, select: { nationalId: true } })).map((e) => e.nationalId));
  const maxNo = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(substring(employee_no from '^E-([0-9]{1,9})$') AS int)) AS max FROM employees WHERE company_id = ${COMPANY_ID}::uuid AND employee_no ~ '^E-[0-9]{1,9}$'`;
  let nextNo = Number(maxNo[0]?.max ?? 0) + 1;

  const banks = ["80", "10", "45", "20", "05"];
  const emp: Record<string, Employee> = {};
  const userIdOf: Record<string, string> = {};
  const logins: Array<{ name: string; role: string; id: string }> = [];

  for (const [i, p] of PEOPLE.entries()) {
    const saudi = p.nationality === "SA";
    let nationalId: string;
    do nationalId = `${saudi ? "1" : "2"}${String(between(100000000, 999999999))}`;
    while (used.has(nationalId));
    used.add(nationalId);

    const hireDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Math.round(p.hiredMonthsAgo * 30.4 * DAY));
    const email = `${p.en.split(" ")[0]?.toLowerCase()}.${p.en.split(" ").at(-1)?.toLowerCase()}@${EMAIL_DOMAIN}`;
    const user = await prisma.user.create({ data: { companyId: COMPANY_ID, email, passwordHash, status: "active", createdBy } });
    userIdOf[p.key] = user.id;

    const birthYear = year - between(p.role === "employee" ? 23 : 32, p.role === "employee" ? 40 : 55);
    const e = await prisma.employee.create({
      data: {
        companyId: COMPANY_ID,
        userId: user.id,
        employeeNo: `E-${String(nextNo++).padStart(4, "0")}`,
        fullNameAr: p.ar,
        fullNameEn: p.en,
        nationalId,
        nationality: p.nationality,
        isSaudi: saudi,
        jobTitle: p.job,
        departmentId: deptIds[p.dept] ?? null,
        branchId: branch.id,
        scheduleId: null,
        managerId: p.manager ? (emp[p.manager]?.id ?? null) : null,
        hireDate,
        status: "active",
        phone: `05${between(0, 9)}${String(between(1000000, 9999999))}`,
        personalEmail: `${p.en.split(" ")[0]?.toLowerCase()}${between(10, 99)}@gmail.com`,
        address: pick(["الرياض - حي النرجس", "الرياض - حي الملقا", "الرياض - حي العليا", "الرياض - حي الياسمين", "الرياض - حي الروضة", "الرياض - حي السويدي"]),
        gender: p.gender,
        birthDate: new Date(`${birthYear}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}T00:00:00.000Z`),
        maritalStatus: pick(["single", "married", "married", "married"]),
        // Everyone has an approved IBAN except two, so payroll shows its "no IBAN" warning.
        iban: i === 13 || i === 23 ? null : iban(pick(banks), String(between(10000000, 99999999)) + String(between(1000000000, 9999999999))),
        createdBy,
      },
    });
    emp[p.key] = e;
    await prisma.employeeAssignment.create({
      data: { companyId: COMPANY_ID, employeeId: e.id, kind: "hire", branchId: branch.id, departmentId: e.departmentId, jobTitle: e.jobTitle, managerId: e.managerId, validFrom: hireDate, appliedAt: new Date(), createdBy },
    });

    // Roles: everyone is an employee; some hold one more role on top.
    await prisma.roleAssignment.create({ data: { companyId: COMPANY_ID, userId: user.id, roleId: EMPLOYEE_ROLE_ID, createdBy } });
    if (p.role !== "employee") await prisma.roleAssignment.create({ data: { companyId: COMPANY_ID, userId: user.id, roleId: ROLE_IDS[p.role], createdBy } });
    logins.push({ name: p.ar, role: ROLE_NAMES[p.role], id: nationalId });

    // Salary: basic + housing (25%) + transport (10%).
    for (const [type, amount] of [["basic", p.basic], ["housing", p.basic * 0.25], ["transport", p.basic * 0.1]] as const) {
      await prisma.salaryComponent.create({ data: { companyId: COMPANY_ID, employeeId: e.id, type, amountHalalas: sar(amount), effectiveFrom: hireDate, createdBy } });
    }

    // Contract: Saudis open-ended (after the first), expats 2-year fixed term; two end soon for the alerts.
    const probationEnd = p.hiredMonthsAgo < 3 ? addDays(hireDate, 89) : null;
    const fixedTerm = !saudi || p.hiredMonthsAgo < 12;
    let endDate: Date | null = null;
    if (fixedTerm) {
      endDate = addDays(hireDate, 730 - 1);
      while (endDate.getTime() < today.getTime()) endDate = addDays(endDate, 730);
    }
    if (p.key === "o3") endDate = addDays(today, 21);
    if (p.key === "c3") endDate = addDays(today, 45);
    await prisma.contract.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, type: fixedTerm ? "fixed_term" : "open_ended", startDate: hireDate, endDate,
        probationEndDate: probationEnd, status: "active", createdBy,
      },
    });

    // Emergency contact.
    await prisma.employeeContact.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id,
        name: `${p.gender === "male" ? pick(["أم", "زوجة", "أخ"]) : pick(["أم", "زوج", "أخت"])} ${p.ar.split(" ")[0]}`,
        relationship: p.gender === "male" ? pick(["mother", "spouse", "sibling"]) : pick(["mother", "spouse", "sibling"]),
        phone: `05${between(0, 9)}${String(between(1000000, 9999999))}`,
        isEmergency: true, createdBy,
      },
    });
  }

  // ---------- medical insurance ----------
  const policy =
    (await prisma.insurancePolicy.findFirst({ where: { companyId: COMPANY_ID } })) ??
    (await prisma.insurancePolicy.create({
      data: { companyId: COMPANY_ID, provider: "بوبا العربية", policyNumber: `BUPA-${year}-7781`, startDate: new Date(`${year}-01-01T00:00:00Z`), endDate: new Date(`${year}-12-31T00:00:00Z`), createdBy },
    }));
  for (const p of PEOPLE) {
    const e = emp[p.key] as Employee;
    const cls = ["executive", "hr_admin", "accountant", "manager"].includes(p.role) ? "VIP" : p.role === "team_lead" ? "A" : p.basic >= 6000 ? "B" : "C";
    await prisma.employeeInsurance.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, policyId: policy.id, class: cls, memberNumber: String(between(10000000, 99999999)),
        startDate: e.hireDate.getTime() > policy.startDate.getTime() ? e.hireDate : policy.startDate, createdBy,
      },
    });
  }

  // ---------- leave ----------
  const types = await prisma.leaveType.findMany({ where: { companyId: COMPANY_ID } });
  const typeId = (code: string): string | undefined => types.find((t) => t.code === code)?.id;
  const hr = userIdOf.hrm as string;
  const leaveDays = new Map<string, Set<string>>(); // employeeId → approved leave dates (for attendance)
  const workingDatesBetween = (a: Date, b: Date): Date[] => {
    const out: Date[] = [];
    for (let d = a; d.getTime() <= b.getTime(); d = addDays(d, 1)) if (isWorkingDay(d)) out.push(d);
    return out;
  };
  const leave = async (key: string, code: string, startOffset: number, length: number, status: "approved" | "pending" | "rejected", reason: string, note?: string) => {
    const id = typeId(code);
    const e = emp[key];
    if (!id || !e) return;
    const start = addDays(today, startOffset);
    const end = addDays(start, length - 1);
    if (start.getUTCFullYear() !== end.getUTCFullYear()) return;
    const days = workingDatesBetween(start, end);
    if (days.length === 0) return;
    await prisma.leaveRequest.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, leaveTypeId: id, startDate: start, endDate: end, days: days.length, reason, status,
        decidedBy: status === "pending" ? null : hr, decidedAt: status === "pending" ? null : addDays(start, -3), decisionNote: note ?? null, createdBy: userIdOf[key],
      },
    });
    if (status === "approved") {
      const set = leaveDays.get(e.id) ?? new Set<string>();
      for (const d of days) set.add(iso(d));
      leaveDays.set(e.id, set);
      const type = types.find((t) => t.code === code);
      if (type?.deductsBalance) {
        await prisma.leaveBalance.upsert({
          where: { companyId_employeeId_leaveTypeId_year: { companyId: COMPANY_ID, employeeId: e.id, leaveTypeId: id, year: start.getUTCFullYear() } },
          create: { companyId: COMPANY_ID, employeeId: e.id, leaveTypeId: id, year: start.getUTCFullYear(), entitledDays: type.defaultDays ?? 0, usedDays: days.length },
          update: { usedDays: { increment: days.length } },
        });
      }
    }
  };
  await leave("s1", "annual", -20, 5, "approved", "إجازة عائلية");
  await leave("o1", "annual", -12, 4, "approved", "سفر");
  await leave("c1", "emergency", -6, 1, "approved", "ظرف عائلي طارئ");
  await leave("t1", "annual", -27, 3, "approved", "مناسبة زواج أخي");
  await leave("o2", "annual", 6, 7, "pending", "إجازة سنوية - زيارة الأهل");
  await leave("c2", "annual", 12, 3, "pending", "مناسبة عائلية");
  await leave("s3", "sick", -1, 2, "pending", "مراجعة طبية — سيتم إرفاق التقرير");
  await leave("o5", "annual", 3, 2, "rejected", "إجازة", "ضغط عمل في هذه الفترة، الرجاء اختيار موعد آخر");
  await leave("h1", "unpaid", -9, 2, "approved", "ظرف خاص");

  // ---------- attendance: the last 30 days, and today's check-ins ----------
  const punch = (e: Employee, dayId: string, kind: "in" | "out", when: Date) => ({
    companyId: COMPANY_ID, employeeId: e.id, attendanceDayId: dayId, kind, at: when,
    lat: branch.lat + (rand() - 0.5) * 0.0006, lng: branch.lng + (rand() - 0.5) * 0.0006, accuracyM: between(6, 25), distanceM: between(5, 60), accepted: true,
  });
  let attendanceRows = 0;
  for (const p of PEOPLE) {
    const e = emp[p.key] as Employee;
    const onLeave = leaveDays.get(e.id) ?? new Set<string>();
    const absentProne = ["o6", "s5", "o5"].includes(p.key);
    const lateProne = ["s3", "o2", "c3", "o3"].includes(p.key);
    for (let back = 30; back >= 0; back -= 1) {
      const d = addDays(today, -back);
      if (d.getTime() < e.hireDate.getTime()) continue;
      const workDate = d;
      const isToday = back === 0;
      if (!isWorkingDay(workDate)) continue;
      if (onLeave.has(iso(workDate))) {
        await prisma.attendanceDay.create({ data: { companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, workDate, status: "leave" } });
        attendanceRows += 1;
        continue;
      }
      const roll = rand();
      if (!isToday && roll < (absentProne ? 0.12 : 0.03)) {
        await prisma.attendanceDay.create({ data: { companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, workDate, status: "absent" } });
        attendanceRows += 1;
        continue;
      }
      if (isToday && roll < 0.15) continue; // not in yet today
      const late = rand() < (lateProne ? 0.35 : 0.08);
      const inMin = late ? between(16, 70) : between(-15, 14); // minutes after 08:00
      const firstIn = at(workDate, 8, 0 + inMin);
      const lateMin = Math.max(0, inMin - 15);
      const twoSessions = !isToday && rand() < 0.15;
      const outAt = at(workDate, 16, between(0, 35));
      const sessions: Array<[Date, Date | null]> = twoSessions
        ? [[firstIn, at(workDate, 12, between(0, 20))], [at(workDate, 13, between(0, 20)), outAt]]
        : [[firstIn, isToday ? null : outAt]];
      const worked = sessions.reduce((m, [a, b]) => m + (b ? Math.floor((b.getTime() - a.getTime()) / 60_000) : 0), 0);
      const lastOut = sessions.at(-1)?.[1] ?? null;
      const day = await prisma.attendanceDay.create({
        data: {
          companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, workDate, status: lateMin > 0 ? "late" : "present",
          firstInAt: firstIn, lastOutAt: lastOut, lateMin, workedMin: worked,
        },
      });
      const punches = sessions.flatMap(([a, b]) => [punch(e, day.id, "in", a), ...(b ? [punch(e, day.id, "out", b)] : [])]);
      await prisma.attendancePunch.createMany({ data: punches });
      attendanceRows += 1;
    }
  }

  // ---------- short permissions ----------
  const shortLeave = async (key: string, dayOffset: number, kind: string, from: string, to: string, status: string, reason: string) => {
    const e = emp[key];
    if (!e) return;
    let d = addDays(today, dayOffset);
    while (!isWorkingDay(d)) d = addDays(d, -1);
    const [fh = 0, fm = 0] = from.split(":").map(Number);
    const [th = 0, tm = 0] = to.split(":").map(Number);
    await prisma.shortLeaveRequest.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, date: d, kind, fromTime: from, toTime: to, minutes: th * 60 + tm - (fh * 60 + fm), reason, status,
        decidedBy: status === "pending" ? null : userIdOf.bm, decidedAt: status === "pending" ? null : addDays(d, -1),
      },
    });
  };
  await shortLeave("s2", -4, "late_arrival", "08:00", "09:30", "approved", "موعد في المستشفى");
  await shortLeave("c1", -2, "early_leave", "14:00", "16:00", "approved", "استلام الأطفال من المدرسة");
  await shortLeave("o4", 1, "mid_day", "11:00", "12:30", "pending", "مراجعة جهة حكومية");
  await shortLeave("t2", 2, "late_arrival", "08:00", "09:00", "pending", "صيانة السيارة");

  // ---------- custody (عهد) ----------
  const custody = async (key: string, amount: number, purpose: string, status: "requested" | "approved" | "paid" | "settled" | "rejected", daysAgo: number) => {
    const e = emp[key];
    if (!e) return;
    const when = addDays(today, -daysAgo);
    await prisma.custodyRequest.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, amountHalalas: sar(amount), purpose, status, createdBy: userIdOf[key],
        decidedBy: status === "requested" ? null : userIdOf.bm, decidedAt: status === "requested" ? null : addDays(when, 1),
        decisionNote: status === "rejected" ? "المبلغ أعلى من المعتاد، قدّم عرض سعر" : null,
        paidBy: status === "paid" || status === "settled" ? userIdOf.acc : null, paidAt: status === "paid" || status === "settled" ? addDays(when, 2) : null,
        technoLinkRef: status === "paid" || status === "settled" ? `TL-${between(10000, 99999)}` : null,
        settledBy: status === "settled" ? userIdOf.acc : null, settledAt: status === "settled" ? addDays(when, 6) : null,
        settledAmountHalalas: status === "settled" ? sar(amount - 35) : null, settlementNote: status === "settled" ? "تمت التسوية بالفواتير" : null,
      },
    });
  };
  await custody("o4", 1500, "شراء مستلزمات صيانة للفرع", "settled", 25);
  await custody("s1", 800, "مصاريف زيارة عملاء", "paid", 8);
  await custody("o3", 2500, "شراء أرفف للمستودع", "approved", 3);
  await custody("c4", 300, "مستلزمات مكتبية للاستقبال", "requested", 1);
  await custody("s5", 6000, "تذاكر سفر لمعرض تجاري", "rejected", 10);

  // ---------- warnings ----------
  const warning = async (key: string, type: string, reason: string, status: string, daysAgo: number, extra: Record<string, unknown> = {}) => {
    const e = emp[key];
    if (!e) return;
    await prisma.warning.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, type, reason, incidentDate: addDays(today, -daysAgo), status, proposedBy: userIdOf.opsLead as string,
        decidedBy: status === "proposed" ? null : hr, decidedAt: status === "proposed" ? null : addDays(today, -daysAgo + 1),
        // Issued warnings were heard first (business-rules.md "Warnings").
        ...(status === "proposed" ? {} : { statementDeclined: true, statementRecordedBy: hr, statementRecordedAt: addDays(today, -daysAgo + 1) }),
        ...extra,
      },
    });
  };
  await warning("o6", "written", "الغياب عن العمل يومين دون إشعار مسبق.", "issued", 12, { acknowledgedAt: addDays(today, -10) });
  await warning("o2", "verbal", "تكرار التأخر عن بداية الدوام خلال الأسبوعين الماضيين.", "issued", 5);
  await warning("o3", "written", "عدم الالتزام بتعليمات السلامة في المستودع.", "proposed", 2);
  await warning("s5", "verbal", "التأخر في تسليم تقارير المبيعات.", "rescinded", 40, { rescindedBy: hr, rescindedAt: addDays(today, -30), rescindedReason: "تبيّن أن التأخير بسبب عطل في النظام" });

  // ---------- pay adjustments for this month ----------
  const adjustment = async (key: string, kind: string, amount: number, reason: string, status: string, source = "manual") => {
    const e = emp[key];
    if (!e) return;
    await prisma.payrollAdjustment.create({
      data: {
        companyId: COMPANY_ID, employeeId: e.id, branchId: branch.id, period, kind, amountHalalas: sar(amount), reason, source, status,
        proposedBy: userIdOf.hrs as string, decidedBy: status === "proposed" ? null : hr, decidedAt: status === "proposed" ? null : new Date(),
      },
    });
  };
  await adjustment("s1", "bonus", 1500, "مكافأة تحقيق هدف المبيعات", "approved");
  await adjustment("o4", "allowance", 500, "بدل عمل إضافي في الجرد الشهري", "approved");
  await adjustment("o6", "deduction", 300, "خصم غياب بدون إشعار", "approved", "absence");
  await adjustment("c2", "bonus", 750, "تقييم ممتاز من العملاء", "proposed");

  // ---------- notifications for HR (things waiting on them) ----------
  for (const [type, entity, params] of [
    ["leave_requested", "leave_requests", { employeeNameAr: PEOPLE[15]?.ar, employeeNameEn: PEOPLE[15]?.en, leaveTypeAr: "إجازة سنوية", leaveTypeEn: "Annual leave", startDate: iso(addDays(today, 6)), endDate: iso(addDays(today, 12)) }],
    ["custody_requested", "custody_requests", { employeeNameAr: PEOPLE[23]?.ar, employeeNameEn: PEOPLE[23]?.en, amountHalalas: "30000" }],
    ["warning_proposed", "warnings", { employeeNameAr: PEOPLE[16]?.ar, employeeNameEn: PEOPLE[16]?.en, warningType: "written" }],
  ] as const) {
    await prisma.notification.create({
      data: { companyId: COMPANY_ID, recipientUserId: hr, type, titleKey: `notifications.${type}`, bodyParams: params, entity, entityId: COMPANY_ID },
    });
  }

  // Access changed (new roles and people): make the API reload everyone's permissions.
  if (process.env.REDIS_URL) {
    try {
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      await redis.incr(`access:version:${COMPANY_ID}`);
      await redis.quit();
    } catch {
      console.warn("Couldn't reach Redis — restart the API so permissions reload.");
    }
  }

  console.log(`\nDemo data added: 1 branch "${branch.name}", ${Object.keys(DEPARTMENTS).length} departments, ${PEOPLE.length} employees, ${attendanceRows} attendance days.`);
  console.log(`Every demo account signs in with its ID number and the password: ${DEMO_PASSWORD}\n`);
  console.table(logins.map((l) => ({ الاسم: l.name, الدور: l.role, "رقم الهوية / الإقامة": l.id })));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
