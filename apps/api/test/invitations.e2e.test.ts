import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import { PrismaClient, type Permission } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { UsersRepository } from "../src/modules/auth";
import { RefreshTokensRepository } from "../src/modules/auth/infrastructure/refresh-tokens.repository";
import { EMPLOYEE_ROLE_ID } from "../src/shared/access/system-roles";
import { hashOpaqueToken } from "../src/shared/auth/opaque-token";
import { hashPassword } from "../src/shared/auth/password";
import { AppModule } from "../src/app.module";
import { EmailQueueService } from "../src/shared/mail/email-queue.service";

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

    // Provisioned by a migration in real databases; accepting an invitation requires it.
    await setupPrisma.role.create({ data: { id: EMPLOYEE_ROLE_ID, name: "Employee", isSystem: true } });

    async function createHrUser(companyId: string, email: string): Promise<string> {
      const role = await setupPrisma.role.create({ data: { companyId, name: "HR" } });
      await setupPrisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
      const user = await setupPrisma.user.create({
        data: { companyId, email, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      await setupPrisma.roleAssignment.create({ data: { companyId: user.companyId, userId: user.id, roleId: role.id } });
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

    // Never enqueue real jobs: a dev worker sharing this Redis would send them to Mailpit.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService)
      .useValue({ enqueue: async (): Promise<void> => undefined })
      .compile();
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

  const accept = (token: string) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: "correct-horse-battery-staple" });
  const code = (res: { body: unknown }): string => (res.body as { error: { code: string } }).error.code;

  it("refuses a stale second acceptance for an already-linked employee: no new account, link kept, invitation not burned", async () => {
    // employeeAId was already linked by the earlier "accepts a valid invitation" test.
    const originalUserId = (await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeAId } })).userId;
    expect(originalUserId).not.toBeNull();
    const usersBefore = await setupPrisma.user.count({ where: { companyId: companyAId } });

    const token = await seedInvitation(employeeAId, "second-token@example.com");
    const res = await accept(token);
    expect(res.status).toBe(422);
    expect(code(res)).toBe("employees.already_linked");

    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeAId } })).userId).toBe(originalUserId);
    expect(await setupPrisma.user.count({ where: { companyId: companyAId } })).toBe(usersBefore);
    expect(await setupPrisma.user.count({ where: { email: "second-token@example.com" } })).toBe(0);
    const invitation = await setupPrisma.invitation.findFirstOrThrow({ where: { email: "second-token@example.com" } });
    expect(invitation.acceptedAt).toBeNull();
  });

  it("refuses to accept an invitation for an inactive employee", async () => {
    const token = await seedInvitation(inactiveEmployeeId, "for-inactive@example.com");
    const res = await accept(token);
    expect(res.status).toBe(422);
    expect(code(res)).toBe("employees.inactive");
    expect(await setupPrisma.user.count({ where: { email: "for-inactive@example.com" } })).toBe(0);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: inactiveEmployeeId } })).userId).toBeNull();
    expect((await setupPrisma.invitation.findFirstOrThrow({ where: { email: "for-inactive@example.com" } })).acceptedAt).toBeNull();
    expect(await setupPrisma.auditLogEntry.count({ where: { entityId: inactiveEmployeeId, action: "link_user" } })).toBe(0);
  });

  it("accepting takes the employee row lock: an acceptance racing a deactivation cannot link an active user to an inactive employee", async () => {
    const employee = await setupPrisma.employee.create({
      data: {
        companyId: companyAId,
        employeeNo: "E-RACE",
        fullNameAr: "سباق",
        fullNameEn: "Race",
        nationalId: "8888888888",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    const token = await seedInvitation(employee.id, "race-hire@example.com");

    // A deactivation is in progress: it holds the employee row (exactly as PATCH does) and is about to commit.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const deactivating = setupPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id}::uuid FOR NO KEY UPDATE`;
        locked();
        await held;
        await tx.employee.update({ where: { id: employee.id }, data: { status: "inactive" } });
      },
      { timeout: 30_000 },
    );
    await isLocked;

    let settled = false;
    const accepting = accept(token).then((res) => {
      settled = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const waited = !settled; // the acceptance waits for the lock instead of racing past it
    release(); // always let the deactivation finish, even if the assertion below fails
    await deactivating;
    expect(waited).toBe(true);
    const res = await accepting;
    expect(res.status).toBe(422);
    expect(code(res)).toBe("employees.inactive");
    expect(await setupPrisma.user.count({ where: { email: "race-hire@example.com" } })).toBe(0);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employee.id } })).userId).toBeNull();
    expect((await setupPrisma.invitation.findFirstOrThrow({ where: { email: "race-hire@example.com" } })).acceptedAt).toBeNull();
  });

  const freshEmployee = (no: string, nationalId: string) =>
    setupPrisma.employee.create({
      data: {
        companyId: companyAId,
        employeeNo: no,
        fullNameAr: "س",
        fullNameEn: no,
        nationalId,
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });

  it("two concurrent acceptances of the same token: exactly one account, the other is refused", async () => {
    const employee = await freshEmployee("E-CC1", "6000000001");
    const token = await seedInvitation(employee.id, "same-token@example.com");
    const results = await Promise.all([accept(token).then((r) => r), accept(token).then((r) => r)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(code(results.find((r) => r.status === 422) as { body: unknown })).toBe("auth.invitation.email_in_use");
    expect(await setupPrisma.user.count({ where: { email: "same-token@example.com" } })).toBe(1);
    expect((await setupPrisma.invitation.findFirstOrThrow({ where: { email: "same-token@example.com" } })).acceptedAt).not.toBeNull();
  });

  it("two live invitations for one employee: one wins, the loser leaves no account and its invitation is not burned", async () => {
    const employee = await freshEmployee("E-CC2", "6000000002");
    const [t1, t2] = [
      await seedInvitation(employee.id, "first-of-two@example.com"),
      await seedInvitation(employee.id, "second-of-two@example.com"),
    ];
    const results = await Promise.all([accept(t1).then((r) => r), accept(t2).then((r) => r)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(code(results.find((r) => r.status === 422) as { body: unknown })).toBe("employees.already_linked");
    const users = await setupPrisma.user.count({ where: { email: { in: ["first-of-two@example.com", "second-of-two@example.com"] } } });
    expect(users).toBe(1);
    const accepted = await setupPrisma.invitation.count({
      where: { employeeId: employee.id, acceptedAt: { not: null } },
    });
    expect(accepted).toBe(1);
  });

  it("a failure while issuing the first session rolls the whole acceptance back; the same token then works", async () => {
    const employee = await freshEmployee("E-CC3", "6000000003");
    const token = await seedInvitation(employee.id, "session-fails@example.com");
    const tokens = app.get(RefreshTokensRepository, { strict: false });
    const failing = vi.spyOn(tokens, "create").mockRejectedValueOnce(new Error("redis/db blip"));
    expect((await accept(token)).status).toBe(500);
    failing.mockRestore();
    expect(await setupPrisma.user.count({ where: { email: "session-fails@example.com" } })).toBe(0);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employee.id } })).userId).toBeNull();
    expect((await setupPrisma.invitation.findFirstOrThrow({ where: { email: "session-fails@example.com" } })).acceptedAt).toBeNull();
    expect((await accept(token)).status).toBe(200); // nothing was burned
  });

  it("a missing Employee role fails the acceptance loudly and leaves nothing behind", async () => {
    const employee = await freshEmployee("E-CC4", "6000000004");
    const token = await seedInvitation(employee.id, "no-role@example.com");
    // The role is referenced by earlier accounts, so simulate "not provisioned" at the repository instead.
    const users = app.get(UsersRepository, { strict: false });
    const missing = vi.spyOn(users, "assignRole").mockResolvedValueOnce(false);
    expect((await accept(token)).status).toBe(500);
    missing.mockRestore();
    expect(await setupPrisma.user.count({ where: { email: "no-role@example.com" } })).toBe(0);
    expect((await setupPrisma.invitation.findFirstOrThrow({ where: { email: "no-role@example.com" } })).acceptedAt).toBeNull();
  });

  it("an acceptance and a concurrent write that references the same employee (manager link) don't deadlock", async () => {
    for (let i = 0; i < 3; i += 1) {
      const target = await freshEmployee(`E-CM${i}A`, `61000000${i}1`);
      const boss = await freshEmployee(`E-CM${i}B`, `61000000${i}2`);
      const token = await seedInvitation(target.id, `manager-race-${i}@example.com`);
      const [acceptRes, patchRes] = await Promise.all([
        accept(token).then((r) => r),
        // boss's manager becomes target: a foreign-key write that needs KEY SHARE on target's row
        request(app.getHttpServer())
          .patch(`/api/v1/employees/${boss.id}`)
          .set("Authorization", `Bearer ${hrToken}`)
          .send({ managerId: target.id })
          .then((r) => r),
      ]);
      expect([acceptRes.status, patchRes.status]).toEqual([200, 200]);
    }
  });

  it("deleting an invited employee works (their invitations go with them); one with other records gets a typed error", async () => {
    const invited = await freshEmployee("E-CC7", "6000000007");
    await seedInvitation(invited.id, "invited-then-deleted@example.com");
    const ok = await request(app.getHttpServer()).delete(`/api/v1/employees/${invited.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect(ok.status).toBe(204);
    expect(await setupPrisma.employee.count({ where: { id: invited.id } })).toBe(0);
    expect(await setupPrisma.invitation.count({ where: { email: "invited-then-deleted@example.com" } })).toBe(0);

    // a salary component still points at the employee: refused with a typed error, and nothing is deleted
    const boss = await freshEmployee("E-CC8", "6000000008");
    await setupPrisma.salaryComponent.create({
      data: { companyId: companyAId, employeeId: boss.id, type: "basic", amountHalalas: 500000n, effectiveFrom: new Date("2026-01-01") },
    });
    const refused = await request(app.getHttpServer()).delete(`/api/v1/employees/${boss.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect([409, 422]).toContain(refused.status);
    expect(code(refused)).toBe("employees.employee.has_dependents");
    expect(await setupPrisma.employee.count({ where: { id: boss.id } })).toBe(1);
  });
});
