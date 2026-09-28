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
import { CheckDocumentExpiriesUseCase } from "../src/modules/employees";
import { companyDateOnly } from "../src/shared/clock/company-date";

describe("document expiry job and notifications", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;
  let checkDocumentExpiries: CheckDocumentExpiriesUseCase;

  let companyAId: string;
  let hrUserId: string;
  let hrToken: string;
  let employeeUserId: string;
  let employeeToken: string;
  let employeeAId: string;
  let inactiveEmployeeId: string;
  let today: Date;

  function daysFromToday(days: number): Date {
    return new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
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

    const company = await setupPrisma.company.create({
      data: { nameAr: "شركة", nameEn: "Company", timezone: "Asia/Riyadh" },
    });
    companyAId = company.id;
    today = companyDateOnly(new Date(), company.timezone);

    const permissionCodes = [PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.NOTIFICATIONS_READ];
    const permissions: Permission[] = [];
    for (const code of permissionCodes) {
      permissions.push(await setupPrisma.permission.upsert({ where: { code }, create: { code }, update: {} }));
    }
    const employeesReadPermission = permissions.find((p) => p.code === PERMISSIONS.EMPLOYEES_READ);
    const notificationsReadPermission = permissions.find((p) => p.code === PERMISSIONS.NOTIFICATIONS_READ);
    if (!employeesReadPermission || !notificationsReadPermission) throw new Error("seed setup: permission missing");

    const hrRole = await setupPrisma.role.create({ data: { companyId: company.id, name: "HR" } });
    await setupPrisma.rolePermission.createMany({
      data: [
        { roleId: hrRole.id, permissionId: employeesReadPermission.id },
        { roleId: hrRole.id, permissionId: notificationsReadPermission.id },
      ],
    });
    const hrUser = await setupPrisma.user.create({
      data: {
        companyId: company.id,
        email: "hr@example.com",
        passwordHash: await hashPassword("password123!"),
        status: "active",
      },
    });
    hrUserId = hrUser.id;
    await setupPrisma.userRole.create({ data: { userId: hrUser.id, roleId: hrRole.id } });

    // The employee's own account: only notifications:read, deliberately NOT
    // employees:read — proves they're notified as the document's *owner*,
    // not because they happen to also be HR.
    const selfServiceRole = await setupPrisma.role.create({
      data: { companyId: company.id, name: "Employee Self-Service" },
    });
    await setupPrisma.rolePermission.create({
      data: { roleId: selfServiceRole.id, permissionId: notificationsReadPermission.id },
    });
    const employeeUser = await setupPrisma.user.create({
      data: {
        companyId: company.id,
        email: "employee@example.com",
        passwordHash: await hashPassword("password123!"),
        status: "active",
      },
    });
    employeeUserId = employeeUser.id;
    await setupPrisma.userRole.create({ data: { userId: employeeUser.id, roleId: selfServiceRole.id } });

    const employee = await setupPrisma.employee.create({
      data: {
        companyId: company.id,
        userId: employeeUser.id,
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
    employeeAId = employee.id;

    const inactiveEmployee = await setupPrisma.employee.create({
      data: {
        companyId: company.id,
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    checkDocumentExpiries = moduleRef.get(CheckDocumentExpiriesUseCase);

    const hrLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "hr@example.com", password: "password123!" });
    hrToken = (hrLogin.body as { accessToken: string }).accessToken;

    const employeeLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "employee@example.com", password: "password123!" });
    employeeToken = (employeeLogin.body as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("notifies permission holders and the document's own linked employee once, with a system-actor audit entry, and is idempotent on rerun", async () => {
    const document = await setupPrisma.employeeDocument.create({
      data: {
        companyId: companyAId,
        employeeId: employeeAId,
        type: "iqama",
        number: "1112223334",
        expiryDate: daysFromToday(60),
        fileKey: "irrelevant/for/this/test",
        contentType: "text/plain",
        originalFilename: "iqama.txt",
        sizeBytes: 1,
        checksumSha256: "0".repeat(64),
        reviewStatus: "approved",
      },
    });

    await checkDocumentExpiries.runForCompany(companyAId);

    const notifications = await setupPrisma.notification.findMany({
      where: { companyId: companyAId, entityId: document.id },
    });
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([employeeUserId, hrUserId].sort());

    const hrNotification = notifications.find((n) => n.recipientUserId === hrUserId);
    expect(hrNotification?.titleKey).toBe("notifications.document_expiring");
    const ownNotification = notifications.find((n) => n.recipientUserId === employeeUserId);
    expect(ownNotification?.titleKey).toBe("notifications.your_document_expiring");
    expect((ownNotification?.bodyParams as { daysLeft: number }).daysLeft).toBe(60);

    const dedup = await setupPrisma.documentExpiryNotice.findMany({ where: { documentId: document.id } });
    expect(dedup.map((d) => d.thresholdDays)).toEqual([60]);

    const auditEntries = await setupPrisma.auditLogEntry.findMany({
      where: { companyId: companyAId, entity: "employee_documents", entityId: document.id, action: "expiry_notice" },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]?.actorId).toBeNull();

    await checkDocumentExpiries.runForCompany(companyAId);
    const notificationsAfterRerun = await setupPrisma.notification.findMany({
      where: { companyId: companyAId, entityId: document.id },
    });
    expect(notificationsAfterRerun).toHaveLength(2);
  });

  it("excludes inactive employees' documents", async () => {
    const document = await setupPrisma.employeeDocument.create({
      data: {
        companyId: companyAId,
        employeeId: inactiveEmployeeId,
        type: "iqama",
        number: "9998887776",
        expiryDate: daysFromToday(60),
        fileKey: "irrelevant/for/this/test",
        contentType: "text/plain",
        originalFilename: "iqama.txt",
        sizeBytes: 1,
        checksumSha256: "0".repeat(64),
        reviewStatus: "approved",
      },
    });

    await checkDocumentExpiries.runForCompany(companyAId);

    const notifications = await setupPrisma.notification.findMany({
      where: { companyId: companyAId, entityId: document.id },
    });
    expect(notifications).toHaveLength(0);
  });

  it("ignores documents still awaiting review or rejected", async () => {
    const document = await setupPrisma.employeeDocument.create({
      data: {
        companyId: companyAId,
        employeeId: employeeAId,
        type: "iqama",
        number: "5554443332",
        expiryDate: daysFromToday(60),
        fileKey: "irrelevant/for/this/test",
        contentType: "text/plain",
        originalFilename: "iqama.txt",
        sizeBytes: 1,
        checksumSha256: "0".repeat(64),
        reviewStatus: "pending_review",
      },
    });

    await checkDocumentExpiries.runForCompany(companyAId);

    expect(await setupPrisma.notification.count({ where: { companyId: companyAId, entityId: document.id } })).toBe(0);
  });

  it("sends a one-time expired notice once the reminder thresholds are already accounted for", async () => {
    const document = await setupPrisma.employeeDocument.create({
      data: {
        companyId: companyAId,
        employeeId: employeeAId,
        type: "passport",
        number: "P1234567",
        expiryDate: daysFromToday(-3),
        fileKey: "irrelevant/for/this/test",
        contentType: "text/plain",
        originalFilename: "passport.txt",
        sizeBytes: 1,
        checksumSha256: "0".repeat(64),
        reviewStatus: "approved",
      },
    });
    // Simulate the 60/30/7-day reminders having already fired earlier.
    await setupPrisma.documentExpiryNotice.createMany({
      data: [60, 30, 7].map((thresholdDays) => ({ companyId: companyAId, documentId: document.id, thresholdDays })),
    });

    await checkDocumentExpiries.runForCompany(companyAId);

    const notifications = await setupPrisma.notification.findMany({
      where: { companyId: companyAId, entityId: document.id },
    });
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((n) => n.type === "document_expired")).toBe(true);
    expect(notifications.map((n) => n.recipientUserId).sort()).toEqual([employeeUserId, hrUserId].sort());

    const dedup = await setupPrisma.documentExpiryNotice.findMany({ where: { documentId: document.id } });
    expect(dedup.map((d) => d.thresholdDays).sort((a, b) => a - b)).toEqual([-1, 7, 30, 60]);
  });

  it("lets a user list and mark-read only their own notifications", async () => {
    const listRes = await request(app.getHttpServer())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(listRes.status).toBe(200);
    const body = listRes.body as { items: Array<{ id: string; recipientUserId: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((n) => n.recipientUserId === employeeUserId)).toBe(true);

    const notificationId = body.items[0]?.id;
    expect(notificationId).toBeDefined();

    const wrongUserRead = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(wrongUserRead.status).toBe(404);

    const readRes = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(readRes.status).toBe(200);
    expect((readRes.body as { readAt: string | null }).readAt).not.toBeNull();
  });
});
