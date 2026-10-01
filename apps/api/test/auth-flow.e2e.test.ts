import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/shared/auth/password";
import { AppModule } from "../src/app.module";
import type Redis from "ioredis";
import { AccessPolicy } from "../src/shared/access/access-policy.service";
import { REDIS_CLIENT } from "../src/shared/queue/redis-client";
import { clearLoginCounters } from "./sign-in-id";

function firstSetCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("expected a Set-Cookie header in the response");
  }
  return raw[0];
}

describe("auth flow", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;
  let companyId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const connectionUri = container.getConnectionUri();

    process.env.DATABASE_URL = connectionUri;
    process.env.APP_DATABASE_URL = connectionUri;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";

    execSync("pnpm exec prisma migrate deploy", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: "inherit",
    });

    setupPrisma = new PrismaClient({ datasources: { db: { url: connectionUri } } });
    const company = await setupPrisma.company.create({ data: { nameAr: "شركة", nameEn: "Test Co" } });
    companyId = company.id;
    await setupPrisma.user.create({
      data: {
        companyId,
        email: "owner@example.com",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        status: "active",
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await clearLoginCounters(app.get<Redis>(REDIS_CLIENT));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("rejects a wrong password", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "owner@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in, refreshes (rotating the cookie), and logs out", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "owner@example.com", password: "correct-horse-battery-staple" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toEqual(expect.any(String));
    const firstCookie = firstSetCookie(loginRes);
    expect(firstCookie).toContain("HttpOnly");

    const refreshRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstCookie);
    expect(refreshRes.status).toBe(200);
    const secondCookie = firstSetCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    // The old (rotated-out) refresh token must no longer work.
    const reuseRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstCookie);
    expect(reuseRes.status).toBe(401);

    // Reuse detection revoked the whole family — the *new* token is dead too.
    const afterReuseRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", secondCookie);
    expect(afterReuseRes.status).toBe(401);
  });

  it("keeps permissions out of the token, reports them at /auth/access, and applies a revocation on the next request", async () => {
    const role = await setupPrisma.role.create({ data: { name: "Directory reader", companyId } });
    const permission = await setupPrisma.permission.upsert({
      where: { code: "employees:read" },
      create: { code: "employees:read" },
      update: {},
    });
    await setupPrisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id, scope: "company" } });
    const user = await setupPrisma.user.create({
      data: {
        companyId,
        email: "with-role@example.com",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        status: "active",
      },
    });
    const assignment = await setupPrisma.roleAssignment.create({ data: { companyId: user.companyId, userId: user.id, roleId: role.id } });

    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "with-role@example.com", password: "correct-horse-battery-staple" });
    expect(loginRes.status).toBe(200);
    const token = (loginRes.body as { accessToken: string }).accessToken;

    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    expect(payload.permissions).toBeUndefined();

    const accessRes = await request(app.getHttpServer()).get("/api/v1/auth/access").set("Authorization", `Bearer ${token}`);
    expect(accessRes.status).toBe(200);
    expect(accessRes.body).toMatchObject({ userId: user.id, permissions: { "employees:read": "company" }, allBranches: true });
    expect((await request(app.getHttpServer()).get("/api/v1/employees").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    // Revoke: the same, still-valid token loses the permission at once (ADR-0011 §4).
    await setupPrisma.roleAssignment.delete({ where: { id: assignment.id } });
    await app.get(AccessPolicy).invalidateCompany(companyId);
    expect((await request(app.getHttpServer()).get("/api/v1/employees").set("Authorization", `Bearer ${token}`)).status).toBe(403);

    // Disable: the token stops working entirely.
    await setupPrisma.user.update({ where: { id: user.id }, data: { status: "disabled" } });
    await app.get(AccessPolicy).invalidateCompany(companyId);
    expect((await request(app.getHttpServer()).get("/api/v1/auth/access").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });

  describe("signing in with a national ID / iqama number", () => {
    const login = (identifier: string, password: string) => request(app.getHttpServer()).post("/api/v1/auth/login").send({ identifier, password });

    beforeAll(async () => {
      const user = await setupPrisma.user.create({
        data: { companyId, email: "employee@example.com", passwordHash: await hashPassword("employee-password-1"), status: "active" },
      });
      await setupPrisma.employee.create({
        data: {
          companyId, employeeNo: "E-0001", fullNameAr: "موظف", fullNameEn: "Employee", nationalId: "1098765432", nationality: "SA",
          isSaudi: true, hireDate: new Date("2025-01-01"), userId: user.id,
        },
      });
    });

    it("lets an employee sign in with their ID number, typed in Latin or Arabic digits", async () => {
      expect((await login("1098765432", "employee-password-1")).status).toBe(200);
      expect((await login("١٠٩٨٧٦٥٤٣٢", "employee-password-1")).status).toBe(200);
    });

    it("refuses an employee's email: employees sign in with their ID number", async () => {
      expect((await login("employee@example.com", "employee-password-1")).status).toBe(401);
    });

    it("gives the same answer for an unknown ID and a wrong password", async () => {
      const unknown = await login("1000000009", "whatever-password");
      const wrong = await login("1098765432", "not-the-password");
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
    });

    it("locks an ID for 15 minutes after 5 wrong passwords, even with the right one, and audits the attempts", async () => {
      // One wrong attempt was made by the test above.
      for (let i = 0; i < 4; i += 1) expect((await login("1098765432", `wrong-${i}`)).status).toBe(401);
      const locked = await login("1098765432", "employee-password-1");
      expect(locked.status).toBe(429);
      expect(locked.body).toMatchObject({ error: { code: "auth.locked" } });
      const failures = await setupPrisma.auditLogEntry.count({ where: { action: "login_failed" } });
      expect(failures).toBeGreaterThanOrEqual(5);
      await clearLoginCounters(app.get<Redis>(REDIS_CLIENT));
      expect((await login("1098765432", "employee-password-1")).status).toBe(200);
    });
  });
});
