import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import ExcelJS from "exceljs";
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
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 } });
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

  it("creating an employee keeps the personal fields that were sent", async () => {
    const created = await http()
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${tokens.hr}`)
      .send({
        fullNameAr: "موظف جديد", fullNameEn: "New Hire", nationalId: "1000000999", nationality: "SA", isSaudi: true,
        branchId: ids.riyadh, hireDate: "2026-01-01", gender: "female", birthDate: "1995-05-05", maritalStatus: "single",
        phone: "0551112222", additionalPhone: "0553334444", personalEmail: "new.hire@example.com",
      });
    expect(created.status).toBe(201);
    const one = await get("hr", `/api/v1/employees/${(created.body as { id: string }).id}`);
    expect(one.body).toMatchObject({
      gender: "female", maritalStatus: "single", phone: "0551112222", additionalPhone: "0553334444", personalEmail: "new.hire@example.com",
    });
    expect((one.body as { birthDate: string }).birthDate.slice(0, 10)).toBe("1995-05-05");
    // Leave the four-employee layout the other tests count on.
    await db.employeeAssignment.deleteMany({ where: { employeeId: (created.body as { id: string }).id } });
    await db.auditLogEntry.deleteMany({ where: { entityId: (created.body as { id: string }).id } });
    await db.employee.delete({ where: { id: (created.body as { id: string }).id } });
  });

  it("one employee's leave balance is returned only within reach", async () => {
    type Balances = { rows: Array<{ employee: { id: string } }> };
    const mine = await get("branchManager", `/api/v1/leave/balances?employeeId=${ids.rWorker}`);
    expect(mine.status).toBe(200);
    expect((mine.body as Balances).rows.map((r) => r.employee.id)).toEqual([ids.rWorker]);
    // Another branch's employee: no rows, the same as the unfiltered list never showing them.
    const other = await get("branchManager", `/api/v1/leave/balances?employeeId=${ids.jWorker}`);
    expect(other.status).toBe(200);
    expect((other.body as Balances).rows).toEqual([]);
    expect((await get("branchManager", "/api/v1/leave/balances?employeeId=not-a-uuid")).status).toBe(400);
  });

  it("an approver reads one employee's short-permission allowance only within reach", async () => {
    const ok = await get("branchManager", `/api/v1/shortleave/allowance?employeeId=${ids.rWorker}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ allowanceMinutes: expect.any(Number), usedMinutes: 0, schedule: null });
    expect((await get("branchManager", `/api/v1/shortleave/allowance?employeeId=${ids.jWorker}`)).status).toBe(403);
    // An employee has no shortleave:read: their own allowance is /shortleave/me/allowance.
    expect((await get("worker", `/api/v1/shortleave/allowance?employeeId=${ids.rWorker}`)).status).toBe(403);
  });

  it("a record's change history can leave out the read log", async () => {
    // HR opening a record writes a "view" entry (personal data was shown).
    expect((await get("hr", `/api/v1/employees/${ids.rWorker}`)).status).toBe(200);
    type Page = { items: Array<{ action: string }> };
    const all = await get("hr", `/api/v1/audit?entity=employees&entityId=${ids.rWorker}`);
    expect((all.body as Page).items.some((e) => e.action === "view")).toBe(true);
    const changes = await get("hr", `/api/v1/audit?entity=employees&entityId=${ids.rWorker}&excludeAction=view`);
    expect(changes.status).toBe(200);
    expect((changes.body as Page).items.some((e) => e.action === "view")).toBe(false);
  });

  it("upcoming contract and probation ends are listed only within reach", async () => {
    // A contract that started 80 days ago: the default 90-day probation ends within the next 30 days.
    const start = new Date(Date.now() - 80 * 86_400_000).toISOString().slice(0, 10);
    const created = await http()
      .post(`/api/v1/employees/${ids.rWorker}/contracts`)
      .set("Authorization", `Bearer ${tokens.hr}`)
      .send({ type: "open_ended", startDate: start });
    expect(created.status).toBe(201);
    type Ending = Array<{ kind: string; employee: { id: string }; daysLeft: number }>;
    const hr = await get("hr", "/api/v1/contracts/ending?days=30");
    expect(hr.status).toBe(200);
    const mine = (hr.body as Ending).filter((x) => x.employee.id === ids.rWorker);
    expect(mine.map((x) => x.kind)).toEqual(["probation_end"]);
    expect(mine[0]?.daysLeft).toBeGreaterThanOrEqual(0);
    // Jeddah-only Branch HR doesn't see a Riyadh employee's contract; an employee has no contracts:read.
    expect(((await get("regionalHr", "/api/v1/contracts/ending")).body as Ending).some((x) => x.employee.id === ids.rWorker)).toBe(false);
    expect((await get("worker", "/api/v1/contracts/ending")).status).toBe(403);
  });

  it("job titles are a managed list: one spelling, written onto the employee, renamed everywhere, kept while in use", async () => {
    const post = (who: string, url: string, body: object) => http().post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
    const patch = (who: string, url: string, body: object) => http().patch(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
    const created = await post("hr", "/api/v1/positions", { nameAr: "محاسب أول", nameEn: "Senior accountant" });
    expect(created.status).toBe(201);
    const positionId = (created.body as { id: string }).id;
    expect((await post("hr", "/api/v1/positions", { nameAr: "محاسب أول" })).status).toBe(422);
    // Company-wide setup: branch-reach HR may read titles but not add them.
    expect((await post("regionalHr", "/api/v1/positions", { nameAr: "سائق" })).status).toBe(403);
    expect((await get("regionalHr", "/api/v1/positions")).status).toBe(200);

    expect((await patch("hr", `/api/v1/employees/${ids.jWorker}`, { positionId })).status).toBe(200);
    expect((await get("hr", `/api/v1/employees/${ids.jWorker}`)).body).toMatchObject({ positionId, jobTitle: "محاسب أول" });
    expect((await patch("hr", `/api/v1/positions/${positionId}`, { nameAr: "محاسب رئيسي" })).status).toBe(200);
    expect((await get("hr", `/api/v1/employees/${ids.jWorker}`)).body).toMatchObject({ jobTitle: "محاسب رئيسي" });
    const list = (await get("hr", "/api/v1/positions")).body as Array<{ id: string; employees: number }>;
    expect(list.find((p) => p.id === positionId)?.employees).toBe(1);

    const del = await http().delete(`/api/v1/positions/${positionId}`).set("Authorization", `Bearer ${tokens.hr}`);
    expect(del.status).toBe(422);
    expect((del.body as { error: { code: string } }).error.code).toBe("employees.position.in_use");
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

    it("a short permission filed before the move: its branch's approver still sees the allowance for it", async () => {
      // rWorker now works in Jeddah; this request was filed while in Riyadh, so Riyadh still decides it.
      const r = await db.shortLeaveRequest.create({
        data: {
          companyId, employeeId: ids.rWorker as string, branchId: ids.riyadh as string, date: new Date("2026-11-03"),
          kind: "late_arrival", fromTime: "08:00", toTime: "09:00", minutes: 60, reason: "Before the move", status: "pending",
        },
      });
      const url = `/api/v1/shortleave/allowance?employeeId=${ids.rWorker}&month=2026-11`;
      expect((await get("branchManager", `${url}&requestId=${r.id}`)).status).toBe(200);
      // Without the request, the employee's current branch decides — not Riyadh's any more.
      expect((await get("branchManager", url)).status).toBe(403);
      // Someone else's request id can't widen reach.
      expect((await get("branchManager", `/api/v1/shortleave/allowance?employeeId=${ids.jWorker}&requestId=${r.id}`)).status).toBe(404);
      // The request's month, whatever month is asked for.
      const other = await get("branchManager", `/api/v1/shortleave/allowance?employeeId=${ids.rWorker}&month=2027-01&requestId=${r.id}`);
      expect((other.body as { month: string }).month).toBe("2026-11");
      // Once decided, the old branch's window closes.
      await db.shortLeaveRequest.update({ where: { id: r.id }, data: { status: "rejected" } });
      expect((await get("branchManager", `${url}&requestId=${r.id}`)).status).toBe(404);
    });
  });

  describe("Excel import of employees", () => {
    type Report = { total: number; ready: number; withErrors: number; created: number; rows: Array<{ row: number; status: string; errors: Array<{ column: string; code: string }> }> };

    /** The template with rows written into its first sheet, as HR would fill it in. */
    async function filled(rows: Array<Record<string, string>>): Promise<Buffer> {
      const res = await get("hr", "/api/v1/employees/import/template.xlsx").buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as ArrayBuffer);
      const sheet = wb.worksheets[0] as ExcelJS.Worksheet;
      sheet.spliceRows(2, 1); // the grey example row
      const keys = (sheet.getRow(1).values as string[]).slice(1);
      expect(keys[1]).toContain("الاسم بالعربية");
      // Typed straight into rows 2, 3, … (the dropdowns already reach down the sheet, so addRow would land below them).
      rows.forEach((r, i) => keyOrder.forEach((k, c) => (sheet.getCell(i + 2, c + 1).value = r[k] ?? null)));
      return Buffer.from(await wb.xlsx.writeBuffer());
    }
    const keyOrder = ["employeeNo", "fullNameAr", "fullNameEn", "nationalId", "nationality", "gender", "birthDate", "maritalStatus", "phone",
      "additionalPhone", "personalEmail", "jobTitle", "department", "branch", "schedule", "managerNo", "hireDate", "iban", "basicSalary",
      "housingAllowance", "transportAllowance"];
    const upload = (who: string, file: Buffer, dryRun: boolean) =>
      http().post(`/api/v1/employees/import?dryRun=${dryRun}`).set("Authorization", `Bearer ${tokens[who]}`).attach("file", file, "employees.xlsx");

    const boss = { employeeNo: "E-900", fullNameAr: "مدير الفرع", fullNameEn: "Branch Boss", nationalId: "1000000900", nationality: "السعودية", branch: "Riyadh", hireDate: "2024-01-01", basicSalary: "9000", housingAllowance: "2250" };
    const report = { employeeNo: "E-901", fullNameAr: "موظفة", fullNameEn: "Staff Member", nationalId: "2000000901", nationality: "Egypt", gender: "أنثى", branch: "riyadh", managerNo: "E-900", hireDate: "15/03/2024", jobTitle: "منسقة استقدام" };

    it("a dry run reports every problem by row and column, and saves nothing", async () => {
      const file = await filled([
        boss,
        report,
        { ...report, employeeNo: "E-902", nationalId: "123" },
        { ...report, employeeNo: "E-903", nationalId: "1000000900" },
        { ...report, employeeNo: "E-904", nationalId: "2000000904", branch: "Dammam", managerNo: "E-999" },
      ]);
      const res = await upload("hr", file, true);
      expect(res.status).toBe(201);
      const body = res.body as Report;
      expect(body).toMatchObject({ total: 5, ready: 2, withErrors: 3, created: 0 });
      const codes = (row: number) => body.rows.find((r) => r.row === row)?.errors.map((e) => `${e.column}:${e.code}`);
      expect(codes(4)).toEqual(["nationalId:invalid"]);
      expect(codes(5)).toEqual(["nationalId:duplicate"]);
      expect(codes(6)?.sort()).toEqual(["branch:unknown", "managerNo:unknown"]);
      expect(await db.employee.count({ where: { companyId, nationalId: "1000000900" } })).toBe(0);
      // With errors, the real run saves nothing either.
      expect(((await upload("hr", file, false)).body as Report).created).toBe(0);
    });

    it("the real run creates everyone (manager first), with salary from the hire date", async () => {
      const res = await upload("hr", await filled([report, boss]), false);
      expect((res.body as Report).created).toBe(2);
      const bossRow = await db.employee.findFirstOrThrow({ where: { companyId, nationalId: "1000000900" } });
      const staff = await db.employee.findFirstOrThrow({ where: { companyId, nationalId: "2000000901" } });
      expect(staff).toMatchObject({ managerId: bossRow.id, nationality: "EG", isSaudi: false, gender: "female", branchId: ids.riyadh });
      expect(staff.hireDate.toISOString().slice(0, 10)).toBe("2024-03-15");
      // A title not in the list yet is added (HR manages setup) and linked.
      expect(staff.jobTitle).toBe("منسقة استقدام");
      expect(staff.positionId).toBe((await db.position.findFirstOrThrow({ where: { companyId, nameAr: "منسقة استقدام" } })).id);
      const salary = await db.salaryComponent.findMany({ where: { employeeId: bossRow.id }, orderBy: { type: "asc" } });
      expect(salary.map((c) => [c.type, c.amountHalalas.toString(), c.effectiveFrom.toISOString().slice(0, 10)])).toEqual([
        ["basic", "900000", "2024-01-01"],
        ["housing", "225000", "2024-01-01"],
      ]);
      // Imported once: the same file again is all duplicates.
      expect(((await upload("hr", await filled([boss]), true)).body as Report).rows[0]?.errors).toEqual([
        { column: "nationalId", code: "exists" },
        { column: "employeeNo", code: "exists" },
      ]);
    });

    it("branch reach applies to every row", async () => {
      const res = await upload("regionalHr", await filled([{ ...report, employeeNo: "E-950", nationalId: "2000000950", managerNo: "" }]), true);
      expect((res.body as Report).rows[0]?.errors).toContainEqual({ column: "branch", code: "out_of_scope" });
      expect((await http().get("/api/v1/employees/import/template.xlsx").set("Authorization", `Bearer ${tokens.worker}`)).status).toBe(403);
    });
  });
});
