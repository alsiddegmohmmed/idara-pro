import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import { PrismaClient, type Permission } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { hashPassword } from "../src/shared/auth/password";
import { AppModule } from "../src/app.module";

describe("company module", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;
  let companyAId: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const connectionUri = container.getConnectionUri();

    process.env.DATABASE_URL = connectionUri;
    process.env.APP_DATABASE_URL = connectionUri;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";

    execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: "inherit",
    });

    setupPrisma = new PrismaClient({ datasources: { db: { url: connectionUri } } });

    const [companyA, companyB] = await Promise.all([
      setupPrisma.company.create({ data: { nameAr: "شركة أ", nameEn: "Company A" } }),
      setupPrisma.company.create({ data: { nameAr: "شركة ب", nameEn: "Company B" } }),
    ]);
    companyAId = companyA.id;

    const permissionCodes = [
      PERMISSIONS.ORG_READ,
      PERMISSIONS.ORG_MANAGE,
    ];
    const permissions: Permission[] = [];
    for (const code of permissionCodes) {
      permissions.push(await setupPrisma.permission.upsert({ where: { code }, create: { code }, update: {} }));
    }

    async function createUserWithRole(companyId: string, email: string): Promise<void> {
      const role = await setupPrisma.role.create({ data: { companyId, name: "Tester" } });
      await setupPrisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
      const user = await setupPrisma.user.create({
        data: { companyId, email, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      await setupPrisma.roleAssignment.create({ data: { companyId: user.companyId, userId: user.id, roleId: role.id } });
    }

    await createUserWithRole(companyA.id, "a@example.com");
    await createUserWithRole(companyB.id, "b@example.com");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "a@example.com", password: "password123!" });
    tokenA = (loginA.body as { accessToken: string }).accessToken;

    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: "b@example.com", password: "password123!" });
    tokenB = (loginB.body as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("creates, lists, updates, and deletes a branch, writing an audit entry each time", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "HQ", lat: 24.7136, lng: 46.6753, radiusM: 100 });
    expect(createRes.status).toBe(201);
    const branchId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${branchId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ radiusM: 200 });
    expect(updateRes.status).toBe(200);
    expect((updateRes.body as { radiusM: number }).radiusM).toBe(200);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/branches/${branchId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(204);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "branches", entityId: branchId },
      orderBy: { at: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(["create", "update", "delete"]);
  });

  it("rejects an invalid schedule (start after end) with a clear error", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/work-schedules")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Night", startTime: "18:00", endTime: "08:00", lateGraceMin: 10, workDays: [0, 1, 2, 3, 4] });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("company.schedule.invalid_time_range");
  });

  it("company B cannot see or modify company A's branch", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Only A", lat: 24.7136, lng: 46.6753, radiusM: 100 });
    const branchId = (createRes.body as { id: string }).id;

    const listAsB = await request(app.getHttpServer())
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listAsB.body).toEqual([]);

    const getAsB = await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const deleteAsB = await request(app.getHttpServer())
      .delete(`/api/v1/branches/${branchId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(deleteAsB.status).toBe(404);
  });
});
