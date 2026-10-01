import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { AppModule } from "../src/app.module";
import { AccessPolicy } from "../src/shared/access/access-policy.service";
import {
  BRANCH_HR_ROLE_ID,
  EMPLOYEE_ROLE_ID,
  EXECUTIVE_ROLE_ID,
  HR_ADMIN_ROLE_ID,
  MANAGER_ROLE_ID,
  SYSTEM_ROLES,
  TEAM_LEAD_ROLE_ID,
} from "../src/shared/access/system-roles";
import { hashPassword } from "../src/shared/auth/password";
import { signInId } from "./sign-in-id";

/**
 * ADR-0011 proof: one company, two branches. Branch-reach users see only their branch, executives see every
 * branch without personal data or salaries, a regional Branch HR sees only the branches assigned to it,
 * a team lead sees their reports, and approvals go to everyone whose reach covers the employee.
 */
describe("access control across branches", () => {
  let container: StartedPostgreSqlContainer;
  let db: PrismaClient;
  let app: NestFastifyApplication;
  let companyId: string;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const get = (who: string, url: string) => http().get(url).set("Authorization", `Bearer ${tokens[who]}`);

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const uri = container.getConnectionUri();
    process.env.DATABASE_URL = uri;
    process.env.APP_DATABASE_URL = uri;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";
    execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: uri },
      stdio: "inherit",
    });
    db = new PrismaClient({ datasources: { db: { url: uri } } });

    // Catalog + system roles, exactly as the migration/seed create them.
    for (const code of Object.values(PERMISSIONS)) await db.permission.upsert({ where: { code }, create: { code }, update: {} });
    const permissionId = new Map((await db.permission.findMany()).map((p) => [p.code, p.id]));
    for (const role of SYSTEM_ROLES) {
      await db.role.create({ data: { id: role.id, key: role.key, name: role.nameEn, isSystem: true, isTemplate: role.template } });
      await db.rolePermission.createMany({
        data: Object.entries(role.grants).map(([code, scope]) => ({ roleId: role.id, permissionId: permissionId.get(code) as string, scope })),
      });
    }

    const company = await db.company.create({ data: { nameAr: "شركة", nameEn: "Co" } });
    companyId = company.id;
    const branch = (name: string) => db.branch.create({ data: { companyId, name, lat: 24.7, lng: 46.7, radiusM: 200 } });
    const riyadh = await branch("Riyadh");
    const jeddah = await branch("Jeddah");
    ids.riyadh = riyadh.id;
    ids.jeddah = jeddah.id;
    await db.leaveType.create({
      data: { companyId, code: "annual", nameAr: "سنوية", nameEn: "Annual", paid: true, deductsBalance: true, defaultDays: 21 },
    });

    let n = 0;
    const employee = async (key: string, branchId: string, managerId: string | null = null) => {
      n += 1;
      const e = await db.employee.create({
        data: {
          companyId, employeeNo: `E-${100 + n}`, fullNameAr: key, fullNameEn: key, nationalId: `10000000${10 + n}`,
          nationality: "Saudi", isSaudi: true, branchId, managerId, hireDate: new Date("2025-01-01"), phone: "0500000000",
        },
      });
      ids[key] = e.id;
      // Career history starts at hire, as the migration backfills it.
      await db.employeeAssignment.create({
        data: { companyId, employeeId: e.id, kind: "hire", branchId, managerId, validFrom: e.hireDate, appliedAt: new Date() },
      });
      await db.salaryComponent.create({
        data: { companyId, employeeId: e.id, type: "basic", amountHalalas: 500_000n, effectiveFrom: new Date("2025-01-01") },
      });
      return e;
    };
    const user = async (key: string, roles: Array<{ roleId: string; branchIds?: string[] }>, employeeId?: string) => {
      const u = await db.user.create({
        data: { companyId, email: `${key}@example.com`, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      ids[`${key}User`] = u.id;
      if (employeeId) await db.employee.update({ where: { id: employeeId }, data: { userId: u.id } });
      for (const r of roles) {
        await db.roleAssignment.create({
          data: {
            companyId, userId: u.id, roleId: r.roleId, branchMode: r.branchIds ? "selected" : "home",
            branches: r.branchIds ? { create: r.branchIds.map((branchId) => ({ branchId })) } : undefined,
          },
        });
      }
    };

    const rManager = await employee("rManager", riyadh.id);
    const lead = await employee("lead", riyadh.id, rManager.id);
    await employee("rWorker", riyadh.id, lead.id);
    await employee("jWorker", jeddah.id);

    await user("branchManager", [{ roleId: EMPLOYEE_ROLE_ID }, { roleId: MANAGER_ROLE_ID }], rManager.id);
    await user("teamLead", [{ roleId: EMPLOYEE_ROLE_ID }, { roleId: TEAM_LEAD_ROLE_ID }], lead.id);
    await user("worker", [{ roleId: EMPLOYEE_ROLE_ID }], ids.rWorker);
    await user("hr", [{ roleId: HR_ADMIN_ROLE_ID }]);
    await user("executive", [{ roleId: EXECUTIVE_ROLE_ID }]);
    await user("regionalHr", [{ roleId: BRANCH_HR_ROLE_ID, branchIds: [jeddah.id] }]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.get(AccessPolicy).invalidateCompany(companyId);

    for (const who of ["branchManager", "teamLead", "worker", "hr", "executive", "regionalHr"]) {
      const res = await http().post("/api/v1/auth/login").send({ identifier: await signInId(db, `${who}@example.com`), password: "password123!" });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await container?.stop();
  });

  const listedIds = async (who: string): Promise<string[]> => {
    const res = await get(who, "/api/v1/employees");
    expect(res.status).toBe(200);
    return (res.body as Array<{ id: string }>).map((e) => e.id).sort();
  };

  it("a branch manager sees only their own branch", async () => {
    expect(await listedIds("branchManager")).toEqual([ids.rManager, ids.lead, ids.rWorker].sort());
    expect((await get("branchManager", `/api/v1/employees/${ids.jWorker}`)).status).toBe(403);
    expect((await get("branchManager", `/api/v1/employees/${ids.rWorker}`)).status).toBe(200);
  });

  it("an executive sees every branch, but no personal data and no salaries", async () => {
    expect(await listedIds("executive")).toHaveLength(4);
    const one = await get("executive", `/api/v1/employees/${ids.jWorker}`);
    expect((one.body as { nationalId: string; phone: string | null }).nationalId).toMatch(/^••••/);
    expect((one.body as { phone: string | null }).phone).toBeNull();
    expect((await get("executive", `/api/v1/employees/${ids.jWorker}/salary-components`)).status).toBe(403);
  });

  it("HR admin sees everyone in full, including salaries", async () => {
    expect(await listedIds("hr")).toHaveLength(4);
    const one = await get("hr", `/api/v1/employees/${ids.jWorker}`);
    expect((one.body as { phone: string }).phone).toBe("0500000000");
    expect((await get("hr", `/api/v1/employees/${ids.rWorker}/salary-components`)).status).toBe(200);
  });

  it("a branch manager never sees salaries or personal data, even in their branch", async () => {
    expect((await get("branchManager", `/api/v1/employees/${ids.rWorker}/salary-components`)).status).toBe(403);
    const one = await get("branchManager", `/api/v1/employees/${ids.rWorker}`);
    expect((one.body as { phone: string | null }).phone).toBeNull();
  });

  it("a regional Branch HR reaches only its selected branches, in full", async () => {
    expect(await listedIds("regionalHr")).toEqual([ids.jWorker]);
    expect((await get("regionalHr", `/api/v1/employees/${ids.jWorker}/salary-components`)).status).toBe(200);
    expect((await get("regionalHr", `/api/v1/employees/${ids.rWorker}/salary-components`)).status).toBe(403);
    // …and cannot move someone into a branch it doesn't reach.
    const move = await http()
      .patch(`/api/v1/employees/${ids.jWorker}`)
      .set("Authorization", `Bearer ${tokens.regionalHr}`)
      .send({ branchId: ids.riyadh });
    expect(move.status).toBe(403);
  });

  it("a team lead reaches their direct and indirect reports only", async () => {
    const res = await get("teamLead", "/api/v1/employees");
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: string }>).map((e) => e.id)).toEqual([ids.rWorker]);
  });

  it("identity documents need the personal-data permission, not just the directory", async () => {
    expect((await get("executive", `/api/v1/employees/${ids.jWorker}/documents`)).status).toBe(403);
    expect((await get("branchManager", `/api/v1/employees/${ids.rWorker}/documents`)).status).toBe(403);
    expect((await get("hr", `/api/v1/employees/${ids.rWorker}/documents`)).status).toBe(200);
  });

  it("changing an employee's branch needs reach over both branches: only company-wide HR here", async () => {
    const to = (who: string, branchId: string) =>
      http().patch(`/api/v1/employees/${ids.jWorker}`).set("Authorization", `Bearer ${tokens[who]}`).send({ branchId });
    expect((await to("regionalHr", ids.riyadh as string)).status).toBe(403);
    expect((await to("hr", ids.riyadh as string)).status).toBe(200);
    expect((await to("hr", ids.jeddah as string)).status).toBe(200); // and back, so later tests see the original layout
  });

  it("branch-reach HR cannot change company-wide departments", async () => {
    const res = await http().post("/api/v1/departments").set("Authorization", `Bearer ${tokens.regionalHr}`).send({ name: "Sales" });
    expect(res.status).toBe(403);
  });

  it("an employee has no directory access", async () => {
    expect((await get("worker", "/api/v1/employees")).status).toBe(403);
  });

  it("/auth/access reports reach and branches", async () => {
    const res = await get("regionalHr", "/api/v1/auth/access");
    expect(res.body).toMatchObject({ allBranches: false, branchIds: [ids.jeddah], permissions: { "salary:read": "branch" } });
    expect((await get("executive", "/api/v1/auth/access")).body).toMatchObject({ allBranches: true });
  });

  it("a leave request notifies everyone who may approve it — and nobody outside its branch", async () => {
    const [annual] = await db.leaveType.findMany({ where: { companyId } });
    const created = await http()
      .post("/api/v1/leave/requests")
      .set("Authorization", `Bearer ${tokens.worker}`)
      .send({ leaveTypeId: annual?.id, startDate: "2026-11-02", endDate: "2026-11-02" });
    expect(created.status).toBe(201);
    const requestId = (created.body as { id: string }).id;
    const notified = (await db.notification.findMany({ where: { companyId, entityId: requestId } })).map((x) => x.recipientUserId).sort();
    expect(notified).toEqual([ids.branchManagerUser, ids.teamLeadUser, ids.hrUser].sort());

    // The first decision wins; the others see it already decided.
    const approve = (who: string) => http().post(`/api/v1/leave/requests/${requestId}/approve`).set("Authorization", `Bearer ${tokens[who]}`).send({});
    expect((await approve("regionalHr")).status).toBe(403);
    expect((await approve("teamLead")).status).toBe(201);
    expect((await approve("branchManager")).status).toBe(422);
  });

  describe("records keep the branch they were created in (ADR-0012)", () => {
    it("after HR corrects an employee's branch, a pending request stays with the original branch; new ones go to the new one", async () => {
      const [annual] = await db.leaveType.findMany({ where: { companyId } });
      const post = (who: string, url: string, body: object) => http().post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
      const filed = await post("worker", "/api/v1/leave/requests", { leaveTypeId: annual?.id, startDate: "2026-11-09", endDate: "2026-11-09" });
      expect(filed.status).toBe(201);
      const pendingId = (filed.body as { id: string }).id;

      const moved = await http().patch(`/api/v1/employees/${ids.rWorker}`).set("Authorization", `Bearer ${tokens.hr}`).send({ branchId: ids.jeddah });
      expect(moved.status).toBe(200);

      const riyadhList = await get("branchManager", "/api/v1/leave/requests?status=pending");
      expect((riyadhList.body as Array<{ id: string; canDecide: boolean }>).find((r) => r.id === pendingId)?.canDecide).toBe(true);
      const jeddahList = await get("regionalHr", "/api/v1/leave/requests?status=pending");
      expect((jeddahList.body as Array<{ id: string }>).some((r) => r.id === pendingId)).toBe(false);

      const next = await post("worker", "/api/v1/leave/requests", { leaveTypeId: annual?.id, startDate: "2026-11-16", endDate: "2026-11-16" });
      expect(next.status).toBe(201);
      const notified = (await db.notification.findMany({ where: { companyId, entityId: (next.body as { id: string }).id } })).map((n) => n.recipientUserId);
      expect(notified).toContain(ids.regionalHrUser);
      expect(notified).not.toContain(ids.branchManagerUser);

      // The edit is kept as history, effective today.
      const history = await get("hr", `/api/v1/employees/${ids.rWorker}/assignments`);
      expect((history.body as Array<{ kind: string; branchId: string }>).map((a) => [a.kind, a.branchId])).toEqual([
        ["change", ids.jeddah],
        ["hire", ids.riyadh],
      ]);
    });
  });
});
