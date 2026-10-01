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

describe("employees module", () => {
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
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_DELETE,
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

  it("creates, lists, updates, and deletes a department, writing an audit entry each time", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Engineering" });
    expect(createRes.status).toBe(201);
    const departmentId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/departments/${departmentId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Engineering & IT" });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/departments/${departmentId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(204);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "departments", entityId: departmentId },
      orderBy: { at: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(["create", "update", "delete"]);
  });

  it("creates, lists, updates, and deletes an employee, writing an audit entry each time", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        employeeNo: "E-001",
        fullNameAr: "أحمد",
        fullNameEn: "Ahmad",
        nationalId: "1234567890",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: "2026-01-01",
      });
    expect(createRes.status).toBe(201);
    const employeeId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ jobTitle: "Engineer" });
    expect(updateRes.status).toBe(200);
    expect((updateRes.body as { jobTitle: string }).jobTitle).toBe("Engineer");

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(204);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "employees", entityId: employeeId },
      orderBy: { at: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(["create", "update", "delete"]);
  });

  it("assigns the next employee number when HR doesn't type one, and refuses an ID that can't be used to sign in", async () => {
    const create = (nationalId: string) =>
      request(app.getHttpServer())
        .post("/api/v1/employees")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ fullNameAr: "تلقائي", fullNameEn: "Auto", nationalId, nationality: "SA", isSaudi: true, hireDate: "2026-01-01" });
    const first = await create("1111111111");
    const second = await create("2222222222");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = (first.body as { employeeNo: string }).employeeNo;
    const b = (second.body as { employeeNo: string }).employeeNo;
    expect(a).toMatch(/^E-\d{4}$/);
    expect(Number(b.slice(2))).toBe(Number(a.slice(2)) + 1);
    expect((await create("12345")).status).toBe(400);
  });

  it("rejects an employee referencing another company's department (cross-tenant FK)", async () => {
    const bDeptRes = await request(app.getHttpServer())
      .post("/api/v1/departments")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "B's dept" });
    const bDepartmentId = (bDeptRes.body as { id: string }).id;

    const res = await request(app.getHttpServer())
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        employeeNo: "E-002",
        fullNameAr: "سارة",
        fullNameEn: "Sara",
        nationalId: "1234567891",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: "2026-01-01",
        departmentId: bDepartmentId,
      });
    expect(res.status).toBe(404);
  });

  it("rejects an employee being their own manager", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        employeeNo: "E-003",
        fullNameAr: "خالد",
        fullNameEn: "Khaled",
        nationalId: "1234567892",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: "2026-01-01",
      });
    const employeeId = (createRes.body as { id: string }).id;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ managerId: employeeId });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("employees.manager_is_self");
  });

  it("rejects an end date before the hire date", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        employeeNo: "E-004",
        fullNameAr: "منى",
        fullNameEn: "Mona",
        nationalId: "1234567893",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: "2026-06-01",
        endDate: "2026-01-01",
      });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("employees.invalid_date_range");
  });
});
