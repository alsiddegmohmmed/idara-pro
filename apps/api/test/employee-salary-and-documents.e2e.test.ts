import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { PrismaClient, type Permission } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { hashPassword } from "../src/shared/auth/password";
import { AppModule } from "../src/app.module";

describe("employee salary components and documents", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;
  let storageDir: string;
  let companyAId: string;
  let employeeAId: string;
  let employeeA2Id: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const connectionUri = container.getConnectionUri();
    storageDir = await mkdtemp(join(tmpdir(), "idara-test-storage-"));

    process.env.DATABASE_URL = connectionUri;
    process.env.APP_DATABASE_URL = connectionUri;
    process.env.FILE_STORAGE_DIR = storageDir;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";

    execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
      cwd: join(__dirname, ".."),
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
      PERMISSIONS.SALARY_READ,
      PERMISSIONS.SALARY_MANAGE,
      PERMISSIONS.EMPLOYEES_READ_SENSITIVE,
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

    const employeeA = await setupPrisma.employee.create({
      data: {
        companyId: companyA.id,
        employeeNo: "E-001",
        fullNameAr: "أحمد",
        fullNameEn: "Ahmad",
        nationalId: "1234567890",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    employeeAId = employeeA.id;

    const employeeA2 = await setupPrisma.employee.create({
      data: {
        companyId: companyA.id,
        employeeNo: "E-002",
        fullNameAr: "سارة",
        fullNameEn: "Sara",
        nationalId: "1234567899",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    employeeA2Id = employeeA2.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.register(multipart);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const loginA = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "a@example.com", password: "password123!" });
    tokenA = (loginA.body as { accessToken: string }).accessToken;

    const loginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "b@example.com", password: "password123!" });
    tokenB = (loginB.body as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
    await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("creates, lists, updates, and deletes a salary component, writing an audit entry each time", async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/salary-components`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "basic", amountHalalas: "500000", effectiveFrom: "2026-01-01" });
    expect(createRes.status).toBe(201);
    // BigInt.prototype.toJSON (apps/api/src/shared/json-bigint-support.ts)
    // makes this a JSON string, not a number — never a float (AGENTS.md §3 rule 3).
    expect(createRes.body.amountHalalas).toBe("500000");
    const componentId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/employees/${employeeAId}/salary-components`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/salary-components/${componentId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ amountHalalas: "600000" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.amountHalalas).toBe("600000");

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/salary-components/${componentId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(204);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "salary_components", entityId: componentId },
      orderBy: { at: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(["create", "update", "delete"]);
  });

  it("rejects an overlapping salary component of the same type", async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/salary-components`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "housing", amountHalalas: "100000", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" });
    expect(first.status).toBe(201);

    const overlapping = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/salary-components`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "housing", amountHalalas: "120000", effectiveFrom: "2026-06-01" });
    expect(overlapping.status).toBe(422);
    expect((overlapping.body as { error: { code: string } }).error.code).toBe(
      "employees.salary_component.overlapping_range",
    );
  });

  it("rejects a salary component for another company's employee", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/salary-components`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ type: "transport", amountHalalas: "50000", effectiveFrom: "2026-01-01" });
    expect(res.status).toBe(404);
  });

  it("uploads a document, downloads the same bytes back, updates metadata, and deletes it", async () => {
    const fileContents = "%PDF-1.4 IQAMA-SCAN-CONTENTS";
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/documents`)
      .set("Authorization", `Bearer ${tokenA}`)
      .field("type", "iqama")
      .field("number", "2000000001")
      .attach("file", Buffer.from(fileContents), { filename: "iqama.pdf", contentType: "application/pdf" });
    expect(uploadRes.status).toBe(201);
    const documentId = (uploadRes.body as { id: string }).id;
    // ADR-0005: name/type/size/checksum metadata, not just the file key.
    expect(uploadRes.body.originalFilename).toBe("iqama.pdf");
    expect(uploadRes.body.sizeBytes).toBe(Buffer.byteLength(fileContents));
    expect(uploadRes.body.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/employees/${employeeAId}/documents/${documentId}/file`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toBe("application/pdf");
    expect(downloadRes.headers["content-disposition"]).toContain('filename="iqama.pdf"');
    expect(Buffer.from(downloadRes.body as Buffer).toString()).toBe(fileContents);

    // The document belongs to employeeA — fetching it through employeeA2's
    // path segment (same company, different employee) must 404, not leak it.
    const wrongPathRes = await request(app.getHttpServer())
      .get(`/api/v1/employees/${employeeA2Id}/documents/${documentId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(wrongPathRes.status).toBe(404);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${employeeAId}/documents/${documentId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ number: "2000000002" });
    expect(updateRes.status).toBe(200);
    expect((updateRes.body as { number: string }).number).toBe("2000000002");

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/employees/${employeeAId}/documents/${documentId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(204);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "employee_documents", entityId: documentId },
      orderBy: { at: "asc" },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual(["create", "download", "update", "delete"]);
  });

  it("rejects a document expiry date before its issue date", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/documents`)
      .set("Authorization", `Bearer ${tokenA}`)
      .field("type", "passport")
      .field("number", "P1234567")
      .field("issueDate", "2030-01-01")
      .field("expiryDate", "2020-01-01")
      .attach("file", Buffer.from("%PDF-1.4 x"), { filename: "passport.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("employees.document.invalid_date_range");
  });
});
