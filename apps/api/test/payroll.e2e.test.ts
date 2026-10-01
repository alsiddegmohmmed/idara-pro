import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, type PayrollItemView, type PayrollRunDetail } from "@idara-pro/shared";
import { AppModule } from "../src/app.module";
import { AccessPolicy } from "../src/shared/access/access-policy.service";
import {
  ACCOUNTANT_ROLE_ID,
  BRANCH_HR_ROLE_ID,
  EMPLOYEE_ROLE_ID,
  EXECUTIVE_ROLE_ID,
  HR_ADMIN_ROLE_ID,
  SYSTEM_ROLES,
} from "../src/shared/access/system-roles";
import { hashPassword } from "../src/shared/auth/password";
import { CLOCK, type Clock } from "../src/shared/clock/clock";
import { signInId } from "./sign-in-id";

/**
 * Payroll (business-rules.md "Payroll"): accounting calculates, HR approves (four eyes) once the month is over and
 * nothing changed since; approval locks the month; branch readers see their branch's lines only; employees see
 * their own payslip. Plus the medical certificate rule on sick leave and who may download it.
 */
describe("payroll runs and leave certificates", () => {
  let container: StartedPostgreSqlContainer;
  let db: PrismaClient;
  let app: NestFastifyApplication;
  let storageDir: string;
  let companyId: string;
  let now = new Date("2026-09-20T09:00:00Z");
  const clock: Clock = { now: () => now };
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${tokens[who]}`),
    post: (url: string, body?: object) => http().post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body ?? {}),
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const uri = container.getConnectionUri();
    storageDir = await mkdtemp(path.join(tmpdir(), "idara-payroll-"));
    process.env.DATABASE_URL = uri;
    process.env.APP_DATABASE_URL = uri;
    process.env.FILE_STORAGE_DIR = storageDir;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";
    execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: uri },
      stdio: "inherit",
    });
    db = new PrismaClient({ datasources: { db: { url: uri } } });

    for (const code of Object.values(PERMISSIONS)) await db.permission.upsert({ where: { code }, create: { code }, update: {} });
    const permissionId = new Map((await db.permission.findMany()).map((p) => [p.code, p.id]));
    for (const role of SYSTEM_ROLES) {
      await db.role.create({ data: { id: role.id, key: role.key, name: role.nameEn, isSystem: true, isTemplate: role.template } });
      await db.rolePermission.createMany({
        data: Object.entries(role.grants).map(([code, scope]) => ({ roleId: role.id, permissionId: permissionId.get(code) as string, scope })),
      });
    }

    const company = await db.company.create({ data: { nameAr: "شركة", nameEn: "Co" } });
    const other = await db.company.create({ data: { nameAr: "أخرى", nameEn: "Other" } });
    companyId = company.id;
    const branch = (name: string) => db.branch.create({ data: { companyId, name, lat: 24.7, lng: 46.7, radiusM: 200 } });
    const riyadh = await branch("Riyadh");
    const jeddah = await branch("Jeddah");
    const sick = await db.leaveType.create({
      data: {
        companyId, code: "sick", nameAr: "مرضية", nameEn: "Sick", paid: true, deductsBalance: false, requiresAttachment: true,
        payTiers: [{ days: 30, percent: 100 }, { days: 60, percent: 75 }, { days: 30, percent: 0 }],
      },
    });
    ids.sick = sick.id;

    let n = 0;
    const employee = async (key: string, branchId: string) => {
      n += 1;
      const e = await db.employee.create({
        data: {
          companyId, employeeNo: `E-${100 + n}`, fullNameAr: key, fullNameEn: key, nationalId: `10000000${10 + n}`, nationality: "Saudi",
          isSaudi: true, branchId, hireDate: new Date("2025-01-01"), iban: "SA0380000000608010167519",
        },
      });
      await db.salaryComponent.create({ data: { companyId, employeeId: e.id, type: "basic", amountHalalas: 500_000n, effectiveFrom: new Date("2025-01-01") } });
      ids[key] = e.id;
      return e;
    };
    await employee("rWorker", riyadh.id);
    await employee("jWorker", jeddah.id);

    const user = async (key: string, roles: Array<{ roleId: string; branchIds?: string[] }>, employeeId?: string, inCompany = companyId) => {
      const u = await db.user.create({ data: { companyId: inCompany, email: `${key}@example.com`, passwordHash: await hashPassword("password123!"), status: "active" } });
      if (employeeId) await db.employee.update({ where: { id: employeeId }, data: { userId: u.id } });
      for (const r of roles) {
        await db.roleAssignment.create({
          data: {
            companyId: inCompany, userId: u.id, roleId: r.roleId, branchMode: r.branchIds ? "selected" : "home",
            branches: r.branchIds ? { create: r.branchIds.map((branchId) => ({ branchId })) } : undefined,
          },
        });
      }
    };
    await user("accountant", [{ roleId: ACCOUNTANT_ROLE_ID }]);
    await user("hr", [{ roleId: HR_ADMIN_ROLE_ID }]);
    await user("regionalHr", [{ roleId: BRANCH_HR_ROLE_ID, branchIds: [jeddah.id] }]);
    await user("executive", [{ roleId: EXECUTIVE_ROLE_ID }]);
    await user("worker", [{ roleId: EMPLOYEE_ROLE_ID }], ids.rWorker);
    await user("outsider", [{ roleId: HR_ADMIN_ROLE_ID }], undefined, other.id);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue(clock).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.register(multipart);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.get(AccessPolicy).invalidateCompany(companyId);
    await app.get(AccessPolicy).invalidateCompany(other.id);
    for (const who of ["accountant", "hr", "regionalHr", "executive", "worker", "outsider"]) {
      const res = await http().post("/api/v1/auth/login").send({ identifier: await signInId(db, `${who}@example.com`), password: "password123!" });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await container?.stop();
    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  });

  const line = (run: PayrollRunDetail, key: string): PayrollItemView | undefined => run.items.find((i) => i.employee?.id === ids[key]);

  it("accounting calculates a month once, even when the request is retried", async () => {
    const first = await as("accountant").post("/api/v1/payroll-runs", { period: "2026-09" }).set("Idempotency-Key", "payroll-2026-09-a");
    expect(first.status).toBe(201);
    const run = first.body as PayrollRunDetail;
    ids.run = run.id;
    expect(run.items).toHaveLength(2);
    expect(line(run, "rWorker")?.grossHalalas).toBe("500000");
    expect(line(run, "rWorker")?.gosiEmployeeHalalas).toBe("48750"); // 9.75% of 5,000
    const retry = await as("accountant").post("/api/v1/payroll-runs", { period: "2026-09" }).set("Idempotency-Key", "payroll-2026-09-a");
    expect((retry.body as PayrollRunDetail).id).toBe(run.id);
    expect((await as("accountant").post("/api/v1/payroll-runs", { period: "2026-09" })).body).toMatchObject({ error: { code: "payroll.run_exists" } });
  });

  it("can't be approved by the calculator, by accounting, or before the month is over", async () => {
    expect((await as("accountant").post(`/api/v1/payroll-runs/${ids.run}/approve`)).status).toBe(403); // no payroll:approve
    const early = await as("hr").post(`/api/v1/payroll-runs/${ids.run}/approve`);
    expect(early.body).toMatchObject({ error: { code: "payroll.month_not_over" } });
  });

  it("refuses approval when anything changed since the calculation, until it is recalculated", async () => {
    now = new Date("2026-10-02T09:00:00Z");
    await db.attendanceDay.create({ data: { companyId, employeeId: ids.rWorker as string, branchId: null, workDate: new Date("2026-09-10"), status: "absent" } });
    expect((await as("hr").post(`/api/v1/payroll-runs/${ids.run}/approve`)).body).toMatchObject({ error: { code: "payroll.stale" } });
    const recalc = await as("accountant").post(`/api/v1/payroll-runs/${ids.run}/recalculate`);
    expect(recalc.status).toBe(201);
    expect(line(recalc.body as PayrollRunDetail, "rWorker")?.absenceHalalas).toBe("16667"); // 5,000 / 30
  });

  it("a branch reader sees only their branch's lines and totals", async () => {
    const res = await as("regionalHr").get(`/api/v1/payroll-runs/${ids.run}`);
    expect(res.status).toBe(200);
    const run = res.body as PayrollRunDetail;
    expect(run.items.map((i) => i.employee?.id)).toEqual([ids.jWorker]);
    expect(run.totals.employees).toBe(1);
    expect((await as("executive").get(`/api/v1/payroll-runs/${ids.run}`)).status).toBe(403);
    expect((await as("outsider").get(`/api/v1/payroll-runs/${ids.run}`)).status).toBe(404);
  });

  it("HR approves; the month is then locked for recalculation and new adjustments", async () => {
    const approved = await as("hr").post(`/api/v1/payroll-runs/${ids.run}/approve`);
    expect(approved.status).toBe(201);
    expect((approved.body as PayrollRunDetail).status).toBe("approved");
    expect((await as("accountant").post(`/api/v1/payroll-runs/${ids.run}/recalculate`)).body).toMatchObject({ error: { code: "payroll.locked" } });
    const adj = await as("hr").post("/api/v1/adjustments", { employeeId: ids.jWorker, period: "2026-09", kind: "bonus", amountHalalas: "10000", reason: "Late bonus", source: "manual" });
    expect(adj.body).toMatchObject({ error: { code: "adjustments.period_closed" } });
  });

  it("a branch export doesn't mark the company run exported; the accountant's does", async () => {
    expect((await as("regionalHr").post(`/api/v1/payroll-runs/${ids.run}/export`)).status).toBe(201);
    expect(((await as("hr").get(`/api/v1/payroll-runs/${ids.run}`)).body as PayrollRunDetail).status).toBe("approved");
    const res = await as("accountant").post(`/api/v1/payroll-runs/${ids.run}/export`);
    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(((await as("hr").get(`/api/v1/payroll-runs/${ids.run}`)).body as PayrollRunDetail).status).toBe("exported");
  });

  it("the employee sees only their own payslip, with a masked IBAN", async () => {
    const mine = (await as("worker").get("/api/v1/me/payslips")).body as PayrollItemView[];
    expect(mine.map((i) => i.employee?.id)).toEqual([ids.rWorker]);
    expect(mine[0]?.ibanMasked).toMatch(/^•+7519$/);
    const run = (await as("hr").get(`/api/v1/payroll-runs/${ids.run}`)).body as PayrollRunDetail;
    const other = line(run, "jWorker");
    expect((await as("worker").get(`/api/v1/me/payslips/${other?.id}`)).status).toBe(404);
  });

  it("sick leave needs a certificate before approval; executives can't download it", async () => {
    const created = await as("worker").post("/api/v1/leave/requests", { leaveTypeId: ids.sick, startDate: "2026-10-04", endDate: "2026-10-05" });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    expect((await as("hr").post(`/api/v1/leave/requests/${id}/approve`)).body).toMatchObject({ error: { code: "leave.attachment_required" } });
    const upload = await http()
      .post(`/api/v1/leave/requests/${id}/attachment`)
      .set("Authorization", `Bearer ${tokens.worker}`)
      .attach("file", Buffer.from("%PDF-1.4\n%test\n"), { filename: "report.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    expect((await as("hr").post(`/api/v1/leave/requests/${id}/approve`)).status).toBe(201);
    expect((await as("hr").get(`/api/v1/leave/requests/${id}/attachment`)).status).toBe(200);
    expect((await as("executive").get(`/api/v1/leave/requests/${id}/attachment`)).status).toBe(404);
    expect((await as("worker").get(`/api/v1/leave/me/requests/${id}/attachment`)).status).toBe(200);
  });
});
