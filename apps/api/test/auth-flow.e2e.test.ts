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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("rejects a wrong password", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in, refreshes (rotating the cookie), and logs out", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "owner@example.com", password: "correct-horse-battery-staple" });
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

  it("issues an access token whose permissions reflect the user's roles", async () => {
    const role = await setupPrisma.role.create({ data: { name: "Owner", isSystem: true } });
    const permission = await setupPrisma.permission.upsert({
      where: { code: "employees:read" },
      create: { code: "employees:read" },
      update: {},
    });
    await setupPrisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const user = await setupPrisma.user.create({
      data: {
        companyId,
        email: "with-role@example.com",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        status: "active",
      },
    });
    await setupPrisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "with-role@example.com", password: "correct-horse-battery-staple" });
    expect(loginRes.status).toBe(200);

    const payload = JSON.parse(
      Buffer.from(loginRes.body.accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { permissions: string[] };
    expect(payload.permissions).toContain("employees:read");
  });
});
