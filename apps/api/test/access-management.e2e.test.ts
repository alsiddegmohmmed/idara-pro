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
import { HR_ADMIN_ROLE_ID, SUPER_ADMIN_ROLE_ID, SYSTEM_ROLES } from "../src/shared/access/system-roles";
import { hashPassword } from "../src/shared/auth/password";
import { signInId } from "./sign-in-id";

/** ADR-0011 §5: roles are data, managed in the app, with guardrails. */
describe("access management", () => {
  let container: StartedPostgreSqlContainer;
  let db: PrismaClient;
  let app: NestFastifyApplication;
  let companyId: string;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({
    get: (url: string) => http().get(url).set("Authorization", `Bearer ${tokens[who]}`),
    post: (url: string, body: object = {}) => http().post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body),
    patch: (url: string, body: object) => http().patch(url).set("Authorization", `Bearer ${tokens[who]}`).send(body),
    delete: (url: string) => http().delete(url).set("Authorization", `Bearer ${tokens[who]}`),
  });

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
    ids.riyadh = (await branch("Riyadh")).id;
    ids.jeddah = (await branch("Jeddah")).id;

    // A custom role giving a Riyadh-branch delegate the right to manage access, but only leave approval at branch reach.
    const delegateRole = await db.role.create({ data: { companyId, name: "Access delegate" } });
    await db.rolePermission.createMany({
      data: [
        { roleId: delegateRole.id, permissionId: permissionId.get(PERMISSIONS.ACCESS_MANAGE) as string, scope: "company" },
        { roleId: delegateRole.id, permissionId: permissionId.get(PERMISSIONS.LEAVE_APPROVE) as string, scope: "branch" },
      ],
    });
    // Everything, company-wide, but not the Super admin role itself.
    const ownerCopy = await db.role.create({ data: { companyId, name: "Owner copy" } });
    await db.rolePermission.createMany({
      data: Object.values(PERMISSIONS).map((code) => ({ roleId: ownerCopy.id, permissionId: permissionId.get(code) as string, scope: "company" })),
    });

    let n = 0;
    const user = async (key: string, roleIds: string[], branchId?: string) => {
      const u = await db.user.create({
        data: { companyId, email: `${key}@example.com`, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      ids[key] = u.id;
      if (branchId) {
        n += 1;
        await db.employee.create({
          data: {
            companyId, userId: u.id, employeeNo: `E-${n}`, fullNameAr: key, fullNameEn: key, nationalId: `2000000${String(n).padStart(3, "0")}`,
            nationality: "Saudi", isSaudi: true, branchId, hireDate: new Date("2025-01-01"),
          },
        });
      }
      for (const roleId of roleIds) {
        const a = await db.roleAssignment.create({ data: { companyId, userId: u.id, roleId } });
        ids[`${key}:${roleId}`] = a.id;
      }
    };
    await user("admin", [SUPER_ADMIN_ROLE_ID]);
    await user("hr", [HR_ADMIN_ROLE_ID]);
    await user("delegate", [delegateRole.id], ids.riyadh);
    await user("owner", [ownerCopy.id]);
    await user("target", [], ids.riyadh);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.get(AccessPolicy).invalidateCompany(companyId);
    for (const who of ["admin", "hr", "delegate", "owner", "target"]) {
      const res = await http().post("/api/v1/auth/login").send({ identifier: await signInId(db, `${who}@example.com`), password: "password123!" });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await container?.stop();
  });

  it("HR admin can review access but not change it", async () => {
    expect((await as("hr").get("/api/v1/access/roles")).status).toBe(200);
    expect((await as("hr").get("/api/v1/access/users")).status).toBe(200);
    expect((await as("hr").get("/api/v1/access/review")).status).toBe(200);
    expect((await as("hr").post("/api/v1/access/assignments", { userId: ids.target, roleId: HR_ADMIN_ROLE_ID })).status).toBe(403);
  });

  it("creates a role in the app, assigns it, and the holder's existing token gains it at once", async () => {
    expect((await as("target").get("/api/v1/employees")).status).toBe(403);
    const created = await as("admin").post("/api/v1/access/roles", {
      name: "Directory viewer",
      grants: [{ code: "employees:read", scope: "branch" }],
    });
    expect(created.status).toBe(201);
    const roleId = (created.body as { id: string }).id;
    expect((await as("admin").post("/api/v1/access/roles", { name: "directory VIEWER", grants: [] })).status).toBe(422);

    const assigned = await as("admin").post("/api/v1/access/assignments", { userId: ids.target, roleId });
    expect(assigned.status).toBe(201);
    ids.viewerAssignment = (assigned.body as { id: string }).id;
    expect((await as("target").get("/api/v1/employees")).status).toBe(200);

    // Retiring the role takes it away from everyone holding it.
    expect((await as("admin").post(`/api/v1/access/roles/${roleId}/archive`)).status).toBe(204);
    expect((await as("target").get("/api/v1/employees")).status).toBe(403);
    expect((await as("admin").post("/api/v1/access/assignments", { userId: ids.target, roleId })).status).toBe(422);
  });

  it("system roles are read-only", async () => {
    const res = await as("admin").patch(`/api/v1/access/roles/${HR_ADMIN_ROLE_ID}`, { name: "Renamed" });
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe("access.role.system");
  });

  it("nobody changes their own access", async () => {
    const res = await as("admin").post("/api/v1/access/assignments", { userId: ids.admin, roleId: HR_ADMIN_ROLE_ID });
    expect((res.body as { error: { code: string } }).error.code).toBe("access.own_access");
  });

  it("no escalation: a delegate grants only what it holds, where it holds it", async () => {
    const wider = await as("delegate").post("/api/v1/access/roles", { name: "Too wide", grants: [{ code: "leave:approve", scope: "company" }] });
    expect((wider.body as { error: { code: string } }).error.code).toBe("access.escalation");
    const ok = await as("delegate").post("/api/v1/access/roles", { name: "Riyadh approver", grants: [{ code: "leave:approve", scope: "branch" }] });
    expect(ok.status).toBe(201);
    const roleId = (ok.body as { id: string }).id;
    const jeddah = await as("delegate").post("/api/v1/access/assignments", { userId: ids.target, roleId, branchMode: "selected", branchIds: [ids.jeddah] });
    expect(jeddah.status).toBe(403);
    const riyadh = await as("delegate").post("/api/v1/access/assignments", { userId: ids.target, roleId, branchMode: "selected", branchIds: [ids.riyadh] });
    expect(riyadh.status).toBe(201);
    // …and cannot hand out the Super admin role.
    expect((await as("delegate").post("/api/v1/access/assignments", { userId: ids.target, roleId: SUPER_ADMIN_ROLE_ID })).status).toBe(403);
  });

  it("the last Super admin cannot be removed", async () => {
    const res = await as("owner").delete(`/api/v1/access/assignments/${ids[`admin:${SUPER_ADMIN_ROLE_ID}`]}`);
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("access.last_super_admin");
  });

  it("every change is audited and the review shows reach and branches", async () => {
    const audits = await db.auditLogEntry.findMany({ where: { companyId, entity: { in: ["roles", "role_assignments"] } } });
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["create", "assign_role", "archive"]));
    const review = await as("admin").get("/api/v1/access/review");
    const target = (review.body as Array<{ userId: string; permissions: Array<{ code: string; reach: string; branchIds: string[] }> }>).find((r) => r.userId === ids.target);
    expect(target?.permissions).toEqual([{ code: "leave:approve", reach: "branch", branchIds: [ids.riyadh] }]);
  });
});
