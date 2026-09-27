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
import { hashOpaqueToken } from "../src/shared/auth/opaque-token";
import { hashPassword } from "../src/shared/auth/password";
import { AppModule } from "../src/app.module";

describe("invitations", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;

  let companyAId: string;
  let hrToken: string;
  let hrTokenB: string;
  let employeeAId: string;
  let inactiveEmployeeId: string;
  let linkedEmployeeId: string;
  let existingUserEmail: string;

  function jwtRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET as string;
  }

  /** Inserts an Invitation row directly with a token we chose ourselves, so
   * the test can call the real /accept endpoint without needing to capture
   * the raw token InvitationsService generates internally (which is only
   * ever logged, never returned — by design, see docs/adr/0007-invitations.md). */
  async function seedInvitation(
    employeeId: string,
    email: string,
    overrides: { expiresAt?: Date; acceptedAt?: Date | null } = {},
  ): Promise<string> {
    const token = `test-token-${Math.random().toString(36).slice(2)}`;
    await setupPrisma.invitation.create({
      data: {
        companyId: companyAId,
        employeeId,
        email,
        tokenHash: hashOpaqueToken(token, jwtRefreshSecret()),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: overrides.acceptedAt ?? null,
      },
    });
    return token;
  }

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
      PERMISSIONS.EMPLOYEES_INVITE,
    ];
    const permissions: Permission[] = [];
    for (const code of permissionCodes) {
      permissions.push(await setupPrisma.permission.upsert({ where: { code }, create: { code }, update: {} }));
    }

    async function createHrUser(companyId: string, email: string): Promise<string> {
      const role = await setupPrisma.role.create({ data: { companyId, name: "HR" } });
      await setupPrisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
      const user = await setupPrisma.user.create({
        data: { companyId, email, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      await setupPrisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      return user.id;
    }

    await createHrUser(companyA.id, "hr@example.com");
    await createHrUser(companyB.id, "hr-b@example.com");

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
        status: "active",
      },
    });
    employeeAId = employeeA.id;

    const inactiveEmployee = await setupPrisma.employee.create({
      data: {
        companyId: companyA.id,
        employeeNo: "E-002",
        fullNameAr: "سارة",
        fullNameEn: "Sara",
        nationalId: "1234567891",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        status: "inactive",
      },
    });
    inactiveEmployeeId = inactiveEmployee.id;

    linkedEmployeeId = (
      await setupPrisma.employee.create({
        data: {
          companyId: companyA.id,
          employeeNo: "E-003",
          fullNameAr: "خالد",
          fullNameEn: "Khaled",
          nationalId: "1234567892",
          nationality: "Saudi",
          isSaudi: true,
          hireDate: new Date("2026-01-01"),
          status: "active",
        },
      })
    ).id;
    const alreadyLinkedUser = await setupPrisma.user.create({
      data: {
        companyId: companyA.id,
        email: "khaled@example.com",
        passwordHash: await hashPassword("password123!"),
        status: "active",
      },
    });
    await setupPrisma.employee.update({ where: { id: linkedEmployeeId }, data: { userId: alreadyLinkedUser.id } });

    existingUserEmail = "existing-user@example.com";
    await setupPrisma.user.create({
      data: {
        companyId: companyA.id,
        email: existingUserEmail,
        passwordHash: await hashPassword("password123!"),
        status: "active",
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const hrLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "hr@example.com", password: "password123!" });
    hrToken = (hrLogin.body as { accessToken: string }).accessToken;

    const hrLoginB = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "hr-b@example.com", password: "password123!" });
    hrTokenB = (hrLoginB.body as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("invites an active, unlinked employee and writes an audit entry, never returning the token hash", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: "ahmad@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe(employeeAId);
    expect(res.body.email).toBe("ahmad@example.com");
    expect(res.body.tokenHash).toBeUndefined();

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "employees", entityId: employeeAId, action: "invite" },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it("rejects inviting an already-linked employee", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${linkedEmployeeId}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: "someone-else@example.com" });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("employees.already_linked");
  });

  it("rejects inviting an inactive employee", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${inactiveEmployeeId}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: "someone@example.com" });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("employees.inactive");
  });

  it("rejects inviting an email already used by another user in the company", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: existingUserEmail });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("auth.invitation.email_in_use");
  });

  it("rejects a cross-tenant invite", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/employees/${employeeAId}/invite`)
      .set("Authorization", `Bearer ${hrTokenB}`)
      .send({ email: "someone@example.com" });
    expect(res.status).toBe(404);
  });

  it("accepts a valid invitation, logs the user in, and links employees.user_id", async () => {
    const token = await seedInvitation(employeeAId, "new-hire@example.com");

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: "correct-horse-battery-staple" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const setCookie = res.headers["set-cookie"];
    expect(Array.isArray(setCookie) ? setCookie[0] : setCookie).toContain("HttpOnly");

    const employee = await setupPrisma.employee.findUnique({ where: { id: employeeAId } });
    const linkedUserId = employee?.userId;
    expect(linkedUserId).not.toBeNull();
    if (!linkedUserId) throw new Error("expected employee.userId to be set");

    const user = await setupPrisma.user.findUnique({ where: { id: linkedUserId } });
    expect(user?.email).toBe("new-hire@example.com");
    expect(user?.status).toBe("active");

    const linkAuditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "employees", entityId: employeeAId, action: "link_user" },
    });
    expect(linkAuditEntries).toHaveLength(1);
    expect(linkAuditEntries[0]?.actorId).toBe(linkedUserId);
  });

  it("rejects accepting an expired token", async () => {
    const token = await seedInvitation(inactiveEmployeeId, "expired@example.com", {
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: "correct-horse-battery-staple" });
    expect(res.status).toBe(401);
  });

  it("rejects accepting an already-accepted token", async () => {
    const token = await seedInvitation(inactiveEmployeeId, "already-accepted@example.com", {
      acceptedAt: new Date(),
    });
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: "correct-horse-battery-staple" });
    expect(res.status).toBe(401);
  });

  it("a stale second acceptance for an already-linked employee still creates a working account, without overwriting the link", async () => {
    // employeeAId was already linked by the earlier "accepts a valid
    // invitation" test — this is exactly the stale-second-token scenario
    // docs/adr/0007-invitations.md accepts as a known tradeoff.
    const before = await setupPrisma.employee.findUnique({ where: { id: employeeAId } });
    const originalUserId = before?.userId;
    expect(originalUserId).not.toBeNull();

    const token = await seedInvitation(employeeAId, "second-token@example.com");
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: "correct-horse-battery-staple" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const after = await setupPrisma.employee.findUnique({ where: { id: employeeAId } });
    expect(after?.userId).toBe(originalUserId);

    const secondUser = await setupPrisma.user.findFirst({ where: { email: "second-token@example.com" } });
    expect(secondUser).not.toBeNull();
  });
});
