import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { PrismaClient, type Permission } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { AppModule } from "../src/app.module";
import { AuditService } from "../src/modules/audit";
import { IssuePasswordResetLinkUseCase } from "../src/modules/auth/application/issue-password-reset-link.use-case";
import { UsersRepository } from "../src/modules/auth";
import { AccessPolicy } from "../src/shared/access/access-policy.service";
import { EMPLOYEE_ROLE_ID } from "../src/shared/access/system-roles";
import { parseTrustProxy } from "../src/shared/config/trust-proxy";
import { hashPassword } from "../src/shared/auth/password";
import { EMAIL_QUEUE, EmailQueueService } from "../src/shared/mail/email-queue.service";
import { REDIS_CLIENT } from "../src/shared/queue/redis-client";
import type Redis from "ioredis";
import type { MailMessage } from "../src/shared/mail/mailer";
import { clearLoginCounters, signInId } from "./sign-in-id";

// Valid Saudi IBANs (ISO 13616 mod-97): the widely published example and one built from a different BBAN.
const IBAN_A = "SA0380000000608010167519";
const IBAN_B = "SA4420000001234567891234";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");

describe("email, self-service profile and HR review", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let app: NestFastifyApplication;
  const sentEmails: MailMessage[] = [];
  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  let companyId: string;
  let hrToken: string; // every HR permission, including employees:review
  let editorToken: string; // employees:update but not employees:review
  let reviewerToken: string; // employees:review only
  let dualToken: string; // reviewer + self-service on their own record
  let selfManagerToken: string;
  let readerToken: string; // employees:read only — must see IBANs masked
  let employeeId: string;
  let employeeToken: string;
  let employeeUserId: string;

  function tokenFromLastEmail(): string {
    const last = sentEmails[sentEmails.length - 1];
    const match = /[?&]token=([^&\s"]+)/.exec(last?.text ?? "");
    if (!match?.[1]) throw new Error("no token link in the last email");
    return decodeURIComponent(match[1]);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const uri = container.getConnectionUri();
    process.env.DATABASE_URL = uri;
    process.env.APP_DATABASE_URL = uri;
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";
    process.env.WEB_APP_URL = "http://web.test";

    execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: uri },
      stdio: "inherit",
    });
    setupPrisma = new PrismaClient({ datasources: { db: { url: uri } } });

    const company = await setupPrisma.company.create({ data: { nameAr: "شركة", nameEn: "Co" } });
    companyId = company.id;

    const permissionRows = new Map<string, Permission>();
    for (const code of Object.values(PERMISSIONS)) {
      permissionRows.set(code, await setupPrisma.permission.upsert({ where: { code }, create: { code }, update: {} }));
    }
    const grant = async (roleId: string, codes: string[]): Promise<void> => {
      await setupPrisma.rolePermission.createMany({
        data: codes.map((code) => ({ roleId, permissionId: permissionRows.get(code)?.id as string })),
      });
    };
    async function userWith(email: string, codes: string[]): Promise<string> {
      const role = await setupPrisma.role.create({ data: { companyId, name: `role-${email}` } });
      await grant(role.id, codes);
      const user = await setupPrisma.user.create({
        data: { companyId, email, passwordHash: await hashPassword("password123!"), status: "active" },
      });
      await setupPrisma.roleAssignment.create({ data: { companyId: user.companyId, userId: user.id, roleId: role.id } });
      return user.id;
    }
    await userWith("hr@example.com", [
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_INVITE,
      PERMISSIONS.EMPLOYEES_DELETE,
      PERMISSIONS.EMPLOYEES_REVIEW,
      PERMISSIONS.EMPLOYEES_MANAGE_ACCESS,
      PERMISSIONS.EMPLOYEES_READ_SENSITIVE,
    ]);
    await userWith("reader@example.com", [PERMISSIONS.EMPLOYEES_READ]);
    // Reviews the queue but has no employees:read — must still be able to open queued documents.
    await userWith("reviewer@example.com", [PERMISSIONS.EMPLOYEES_REVIEW]);
    // An HR user who is also an employee: reviewer AND self-service, linked to their own record.
    const dualUserId = await userWith("dual@example.com", [
      PERMISSIONS.EMPLOYEES_REVIEW,
      PERMISSIONS.EMPLOYEES_SELF_SERVICE,
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_READ_SENSITIVE,
    ]);
    await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-900",
        fullNameAr: "مراجع",
        fullNameEn: "Dual",
        nationalId: "1234567891",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: dualUserId,
      },
    });
    // Can restore access AND is an employee themselves: must never restore their own.
    const selfManagerId = await userWith("selfmgr@example.com", [
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_MANAGE_ACCESS,
    ]);
    await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-906",
        fullNameAr: "مدير",
        fullNameEn: "Self manager",
        nationalId: "1234567896",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: selfManagerId,
      },
    });
    // Can edit employees but is NOT a reviewer: must not be able to set the payroll IBAN.
    await userWith("editor@example.com", [PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_UPDATE]);

    // The seeded default role every invited employee receives.
    await setupPrisma.role.create({ data: { id: EMPLOYEE_ROLE_ID, name: "Employee", isSystem: true } });
    await grant(EMPLOYEE_ROLE_ID, [PERMISSIONS.EMPLOYEES_SELF_SERVICE, PERMISSIONS.NOTIFICATIONS_READ]);

    const employee = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-001",
        fullNameAr: "أحمد",
        fullNameEn: "Ahmad",
        nationalId: "1234567890",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    employeeId = employee.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // The real EmailQueueService (it defers sending until commit) on top of a fake queue that records "sent" mail.
      .overrideProvider(getQueueToken(EMAIL_QUEUE))
      .useValue({ add: async (_name: string, message: MailMessage): Promise<void> => void sentEmails.push(message) })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ trustProxy: parseTrustProxy("loopback") }));
    await app.register(cookie);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await clearLoginCounters(app.get<Redis>(REDIS_CLIENT));
    const login = async (email: string): Promise<string> =>
      ((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, email), password: "password123!" })).body as { accessToken: string })
        .accessToken;
    hrToken = await login("hr@example.com");
    readerToken = await login("reader@example.com");
    editorToken = await login("editor@example.com");
    selfManagerToken = await login("selfmgr@example.com");
    reviewerToken = await login("reviewer@example.com");
    dualToken = await login("dual@example.com");
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("invite enqueues a bilingual email with a 72-hour one-time link; accepting it yields self-service permissions", async () => {
    const res = await http()
      .post(`/api/v1/employees/${employeeId}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: "ahmad@example.com" });
    expect(res.status).toBe(201);

    const hours = (new Date(res.body.expiresAt as string).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThan(72.1);

    const email = sentEmails[sentEmails.length - 1];
    expect(email?.to).toBe("ahmad@example.com");
    expect(email?.html).toContain('dir="rtl"');
    expect(email?.html).toContain("Set your password");
    expect(email?.text).toContain("http://web.test/accept-invitation?token=");

    const accept = await http()
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromLastEmail(), password: "correct-horse-battery" });
    expect(accept.status).toBe(200);
    employeeToken = (accept.body as { accessToken: string }).accessToken;
    const claims = JSON.parse(Buffer.from(employeeToken.split(".")[1] as string, "base64url").toString()) as { sub: string };
    employeeUserId = claims.sub;
    const access = await http().get("/api/v1/auth/access").set("Authorization", `Bearer ${employeeToken}`);
    expect(Object.keys((access.body as { permissions: Record<string, string> }).permissions).sort()).toEqual(
      [PERMISSIONS.EMPLOYEES_SELF_SERVICE, PERMISSIONS.NOTIFICATIONS_READ].sort(),
    );

    // the link is one-time
    const again = await http()
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromLastEmail(), password: "another-password-1" });
    expect(again.status).toBe(401);
  });

  it("lets the employee edit contact fields immediately, but never HR-owned fields", async () => {
    const ok = await http()
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ phone: "0500000000", additionalPhone: "0511111111", address: "Riyadh" });
    expect(ok.status).toBe(200);
    expect(ok.body.phone).toBe("0500000000");

    const forbiddenField = await http()
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ jobTitle: "CEO" });
    expect(forbiddenField.status).toBe(400);

    const audit = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "employees", entityId: employeeId, action: "update_profile" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBe(employeeUserId);
  });

  it("gates /me and the review queue by permission", async () => {
    expect((await http().get("/api/v1/me/profile").set("Authorization", `Bearer ${hrToken}`)).status).toBe(403);
    expect((await http().get("/api/v1/review-queue").set("Authorization", `Bearer ${employeeToken}`)).status).toBe(403);
    expect((await http().get("/api/v1/employees").set("Authorization", `Bearer ${employeeToken}`)).status).toBe(403);
  });

  it("validates IBANs (format + checksum), normalizing spaces and case", async () => {
    const bad = await http()
      .post("/api/v1/me/iban")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ iban: "SA0480000000608010167519" });
    expect(bad.status).toBe(400);

    const spaced = await http()
      .post("/api/v1/me/iban")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ iban: "sa03 8000 0000 6080 1016 7519" });
    expect(spaced.status).toBe(200);
    expect(spaced.body.pendingIban).toBe(IBAN_A);
    expect(spaced.body.iban).toBeNull(); // nothing approved yet
    expect(spaced.body.ibanReviewStatus).toBe("pending_review");
  });

  it("masks the IBAN for employees:read holders and shows it in full to reviewers", async () => {
    const asReader = await http().get(`/api/v1/employees/${employeeId}`).set("Authorization", `Bearer ${readerToken}`);
    expect(asReader.body.pendingIban).toBe("SA•• •••• ••••7519");
    const list = await http().get("/api/v1/employees").set("Authorization", `Bearer ${readerToken}`);
    expect(JSON.stringify(list.body)).not.toContain(IBAN_A);

    const asReviewer = await http().get(`/api/v1/employees/${employeeId}`).set("Authorization", `Bearer ${hrToken}`);
    expect(asReviewer.body.pendingIban).toBe(IBAN_A);
  });

  it("rejecting an IBAN needs a reason; the employee sees it and is notified; approving updates the IBAN", async () => {
    const queue = await http().get("/api/v1/review-queue").set("Authorization", `Bearer ${hrToken}`);
    expect(queue.status).toBe(200);
    expect((queue.body as { ibans: Array<{ employeeId: string }> }).ibans.map((i) => i.employeeId)).toContain(employeeId);

    const noReason = await http()
      .post(`/api/v1/employees/${employeeId}/iban/reject`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_A });
    expect(noReason.status).toBe(400);

    const rejected = await http()
      .post(`/api/v1/employees/${employeeId}/iban/reject`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_A, reason: "Name on the account does not match" });
    expect(rejected.status).toBe(200);

    const profile = await http().get("/api/v1/me/profile").set("Authorization", `Bearer ${employeeToken}`);
    expect(profile.body.ibanReviewStatus).toBe("rejected");
    expect(profile.body.ibanReviewReason).toBe("Name on the account does not match");
    expect(profile.body.iban).toBeNull();

    await http().post("/api/v1/me/iban").set("Authorization", `Bearer ${employeeToken}`).send({ iban: IBAN_B });
    const approved = await http()
      .post(`/api/v1/employees/${employeeId}/iban/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_B });
    expect(approved.status).toBe(200);
    expect(approved.body.iban).toBe(IBAN_B);
    expect(approved.body.pendingIban).toBeNull();
    expect(approved.body.ibanReviewStatus).toBeNull();

    // nothing left to decide
    const twice = await http()
      .post(`/api/v1/employees/${employeeId}/iban/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_B });
    expect(twice.status).toBe(422);

    const notes = await http().get("/api/v1/notifications").set("Authorization", `Bearer ${employeeToken}`);
    const types = (notes.body as { items: Array<{ type: string }> }).items.map((n) => n.type);
    expect(types).toContain("iban_rejected");
    expect(types).toContain("iban_approved");

    const audit = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "employees", entityId: employeeId, action: { in: ["submit_iban", "reject_iban", "approve_iban"] } },
    });
    expect(audit.map((a) => a.action).sort()).toEqual(["approve_iban", "reject_iban", "submit_iban", "submit_iban"]);
    expect(JSON.stringify(audit)).not.toContain(IBAN_B); // audit carries last-4 only
  });

  it("IBAN decisions are atomic: a stale approval is refused and two reviewers cannot both decide", async () => {
    // Currently approved: IBAN_B, nothing pending. The employee submits IBAN_A.
    await http().post("/api/v1/me/iban").set("Authorization", `Bearer ${employeeToken}`).send({ iban: IBAN_A });

    // The reviewer saw IBAN_B pending, but the employee has since submitted IBAN_A.
    const stale = await http()
      .post(`/api/v1/employees/${employeeId}/iban/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_B });
    expect(stale.status).toBe(422);
    expect((stale.body as { error: { code: string } }).error.code).toBe("employees.iban.changed");
    const unchanged = await http().get("/api/v1/me/profile").set("Authorization", `Bearer ${employeeToken}`);
    expect(unchanged.body.iban).toBe(IBAN_B);
    expect(unchanged.body.pendingIban).toBe(IBAN_A);

    // Approve and reject fired at the same time: exactly one wins.
    const before = await setupPrisma.auditLogEntry.count({
      where: { companyId, entityId: employeeId, action: { in: ["approve_iban", "reject_iban"] } },
    });
    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/employees/${employeeId}/iban/approve`)
        .set("Authorization", `Bearer ${hrToken}`)
        .send({ expectedIban: IBAN_A }),
      http()
        .post(`/api/v1/employees/${employeeId}/iban/reject`)
        .set("Authorization", `Bearer ${hrToken}`)
        .send({ expectedIban: IBAN_A, reason: "Concurrent decision" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    const after = await setupPrisma.auditLogEntry.count({
      where: { companyId, entityId: employeeId, action: { in: ["approve_iban", "reject_iban"] } },
    });
    expect(after - before).toBe(1);
  });

  it("only reviewers may set the IBAN directly, and doing so supersedes a pending submission", async () => {
    const denied = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ iban: IBAN_A });
    expect(denied.status).toBe(403);
    const otherFields = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ jobTitle: "Accountant" });
    expect(otherFields.status).toBe(200);

    await http().post("/api/v1/me/iban").set("Authorization", `Bearer ${employeeToken}`).send({ iban: IBAN_B });
    const direct = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ iban: IBAN_A });
    expect(direct.status).toBe(200);
    expect(direct.body.iban).toBe(IBAN_A);
    expect(direct.body.pendingIban).toBeNull();
    expect(direct.body.ibanReviewStatus).toBeNull();
  });

  it("checks uploaded files by their real type and size; self-service uploads wait for HR, HR uploads don't", async () => {
    const fake = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("type", "iqama")
      .field("number", "2000000001")
      .attach("file", Buffer.from("MZ this is an executable"), { filename: "iqama.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(422);
    expect((fake.body as { error: { code: string } }).error.code).toBe("employees.document.invalid_file_type");

    const tooBig = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("type", "iqama")
      .field("number", "2000000001")
      .attach("file", Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), { filename: "big.pdf", contentType: "application/pdf" });
    expect(tooBig.status).toBe(422);
    expect((tooBig.body as { error: { code: string } }).error.code).toBe("employees.document.too_large");

    const mine = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("type", "iqama")
      .field("number", "2000000001")
      .attach("file", PDF, { filename: "iqama.pdf", contentType: "application/pdf" });
    expect(mine.status).toBe(201);
    expect(mine.body.reviewStatus).toBe("pending_review");
    expect(mine.body.fileKey).toBeUndefined();

    const hrs = await http()
      .post(`/api/v1/employees/${employeeId}/documents`)
      .set("Authorization", `Bearer ${hrToken}`)
      .field("type", "contract")
      .field("number", "C-1")
      .attach("file", PDF, { filename: "contract.pdf", contentType: "application/pdf" });
    expect(hrs.status).toBe(201);
    expect(hrs.body.reviewStatus).toBe("approved");

    const queue = await http().get("/api/v1/review-queue").set("Authorization", `Bearer ${hrToken}`);
    const pendingIds = (queue.body as { documents: Array<{ id: string }> }).documents.map((d) => d.id);
    expect(pendingIds).toEqual([mine.body.id]);

    const rejected = await http()
      .post(`/api/v1/employees/${employeeId}/documents/${mine.body.id}/reject`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ reason: "Scan is unreadable" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.reviewStatus).toBe("rejected");
    expect(rejected.body.reviewReason).toBe("Scan is unreadable");

    const docs = await http().get("/api/v1/me/documents").set("Authorization", `Bearer ${employeeToken}`);
    expect((docs.body as Array<{ reviewReason: string | null }>).some((d) => d.reviewReason === "Scan is unreadable")).toBe(true);

    const again = await http()
      .post(`/api/v1/employees/${employeeId}/documents/${mine.body.id}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(again.status).toBe(422);

    const second = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("type", "passport")
      .field("number", "P-9")
      .attach("file", PDF, { filename: "passport.pdf", contentType: "application/pdf" });
    const approve = await http()
      .post(`/api/v1/employees/${employeeId}/documents/${second.body.id}/approve`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(approve.body.reviewStatus).toBe("approved");

    const notes = await http().get("/api/v1/notifications").set("Authorization", `Bearer ${employeeToken}`);
    const types = (notes.body as { items: Array<{ type: string }> }).items.map((n) => n.type);
    expect(types).toContain("document_rejected");
    expect(types).toContain("document_approved");
  });

  it("a reviewer cannot approve or reject their own IBAN or documents; someone else can", async () => {
    const submitted = await http().post("/api/v1/me/iban").set("Authorization", `Bearer ${dualToken}`).send({ iban: IBAN_B });
    expect(submitted.status).toBe(200);
    const upload = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${dualToken}`)
      .field("type", "passport")
      .field("number", "P7654321")
      .attach("file", PDF, { filename: "passport.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    const documentId = (upload.body as { id: string }).id;
    const dual = await setupPrisma.employee.findFirstOrThrow({ where: { companyId, employeeNo: "E-900" } });

    const queue = await http().get("/api/v1/review-queue").set("Authorization", `Bearer ${dualToken}`);
    const q = queue.body as { ibans: Array<{ employeeId: string; isOwn: boolean }>; documents: Array<{ id: string; isOwn: boolean }> };
    expect(q.ibans.find((i) => i.employeeId === dual.id)?.isOwn).toBe(true);
    expect(q.documents.find((d) => d.id === documentId)?.isOwn).toBe(true);

    // built lazily: each supertest request must start only when awaited
    const attempts: Array<() => request.Test> = [
      () => http().post(`/api/v1/employees/${dual.id}/iban/approve`).send({ expectedIban: IBAN_B }),
      () => http().post(`/api/v1/employees/${dual.id}/iban/reject`).send({ expectedIban: IBAN_B, reason: "no" }),
      () => http().post(`/api/v1/employees/${dual.id}/documents/${documentId}/approve`).send({}),
      () => http().post(`/api/v1/employees/${dual.id}/documents/${documentId}/reject`).send({ reason: "no" }),
    ];
    for (const attempt of attempts) {
      const res = await attempt().set("Authorization", `Bearer ${dualToken}`);
      expect(res.status).toBe(403);
      expect((res.body as { error: { code: string } }).error.code).toBe("employees.review.own_submission");
    }
    const unchanged = await http().get("/api/v1/me/profile").set("Authorization", `Bearer ${dualToken}`);
    expect(unchanged.body.pendingIban).toBe(IBAN_B);
    expect(unchanged.body.iban).toBeNull();

    // The same person can't route around the check through the HR-side endpoints on their own record.
    const directIban = await http()
      .patch(`/api/v1/employees/${dual.id}`)
      .set("Authorization", `Bearer ${dualToken}`)
      .send({ iban: IBAN_A });
    expect(directIban.status).toBe(403);
    expect((directIban.body as { error: { code: string } }).error.code).toBe("employees.review.own_submission");
    const hrUpload = await http()
      .post(`/api/v1/employees/${dual.id}/documents`)
      .set("Authorization", `Bearer ${dualToken}`)
      .field("type", "iqama")
      .field("number", "1")
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(hrUpload.status).toBe(403);

    // A different reviewer can decide both.
    const okIban = await http()
      .post(`/api/v1/employees/${dual.id}/iban/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ expectedIban: IBAN_B });
    expect(okIban.status).toBe(200);
    const okDoc = await http()
      .post(`/api/v1/employees/${dual.id}/documents/${documentId}/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
    expect(okDoc.status).toBe(200);
  });

  it("reviewers can open queued documents without employees:read, and only queued ones", async () => {
    const upload = await http()
      .post("/api/v1/me/documents")
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("type", "iqama")
      .field("number", "2000000077")
      .attach("file", PDF, { filename: "iqama.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    const documentId = (upload.body as { id: string }).id;

    // the HR-facing route still needs employees:read
    const viaEmployees = await http()
      .get(`/api/v1/employees/${employeeId}/documents/${documentId}/file`)
      .set("Authorization", `Bearer ${reviewerToken}`);
    expect(viaEmployees.status).toBe(403);

    const viaQueue = await http()
      .get(`/api/v1/review-queue/documents/${employeeId}/${documentId}/file`)
      .set("Authorization", `Bearer ${reviewerToken}`);
    expect(viaQueue.status).toBe(200);
    expect(viaQueue.headers["content-type"]).toBe("application/pdf");
    expect(viaQueue.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(viaQueue.body as Buffer).equals(PDF)).toBe(true);

    // the document must belong to the employee in the path, and the download is audited with the actor
    const wrongEmployee = await http()
      .get(`/api/v1/review-queue/documents/${(await setupPrisma.employee.findFirstOrThrow({ where: { companyId, employeeNo: "E-900" } })).id}/${documentId}/file`)
      .set("Authorization", `Bearer ${reviewerToken}`);
    expect(wrongEmployee.status).toBe(404);
    const downloads = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "employee_documents", entityId: documentId, action: "download" },
    });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.actorId).not.toBeNull();

    // no review permission → no access; decided document → no longer in the queue
    expect(
      (await http().get(`/api/v1/review-queue/documents/${employeeId}/${documentId}/file`).set("Authorization", `Bearer ${readerToken}`))
        .status,
    ).toBe(403);
    await http()
      .post(`/api/v1/employees/${employeeId}/documents/${documentId}/approve`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
    const after = await http()
      .get(`/api/v1/review-queue/documents/${employeeId}/${documentId}/file`)
      .set("Authorization", `Bearer ${reviewerToken}`);
    expect(after.status).toBe(422);
  });

  it("deactivating an employee disables their user and ends every session, audited — and a failed cut-off is not silent", async () => {
    const login = await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, "ahmad@example.com"), password: "correct-horse-battery" });
    expect(login.status).toBe(200);
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0] as string;

    // If disabling the user throws, HR must see an error (not a 200), and can simply save again.
    const users = app.get(UsersRepository, { strict: false });
    const failing = vi.spyOn(users, "transitionStatus").mockRejectedValueOnce(new Error("database blip"));
    const failed = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "inactive" });
    expect(failed.status).toBe(500);
    failing.mockRestore();
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("active");
    // the whole request rolled back: the employee is still active too (nothing half-saved)
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).status).toBe("active");

    const retry = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "inactive" });
    expect(retry.status).toBe(200);

    expect((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, "ahmad@example.com"), password: "correct-horse-battery" })).status).toBe(401);
    expect((await http().post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);

    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("disabled");
    expect(await setupPrisma.refreshToken.count({ where: { userId: employeeUserId, revokedAt: null } })).toBe(0);
    const audit = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "users", entityId: employeeUserId, action: "disable_access" },
    });
    expect(audit).toHaveLength(1); // the failed first attempt wrote nothing
    expect(audit[0]?.actorId).not.toBeNull();
  });

  it("re-activating an employee re-enables their user (fresh login only, no revived sessions), audited; failures roll back", async () => {
    // Continues from the deactivation test: the employee is inactive and their user disabled.
    const users = app.get(UsersRepository, { strict: false });
    const failing = vi.spyOn(users, "restoreDisabled").mockRejectedValueOnce(new Error("database blip"));
    const failed = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "active" });
    expect(failed.status).toBe(500);
    failing.mockRestore();
    // consistent: still inactive + disabled, so HR can just try again
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).status).toBe("inactive");
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("disabled");

    const ok = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "active" });
    expect(ok.status).toBe(200);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("active");
    // nothing from before the deactivation is alive; the person has to log in again
    expect(await setupPrisma.refreshToken.count({ where: { userId: employeeUserId, revokedAt: null } })).toBe(0);
    // the OLD password is dead; a password-set link was emailed instead
    const oldPassword = await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, "ahmad@example.com"), password: "correct-horse-battery" });
    expect(oldPassword.status).toBe(401);
    const mail = sentEmails[sentEmails.length - 1];
    expect(mail?.to).toBe("ahmad@example.com");
    expect(mail?.text).toContain("http://web.test/reset-password?token=");
    const setPassword = await http()
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token: tokenFromLastEmail(), newPassword: "a-brand-new-password-1" });
    expect(setPassword.status).toBe(204);
    const login = await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, "ahmad@example.com"), password: "a-brand-new-password-1" });
    expect(login.status).toBe(200);

    const audit = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "users", entityId: employeeUserId, action: "enable_access" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ passwordInvalidated: true, passwordLinkRequested: true });
    expect(audit[0]?.actorId).not.toBeNull();
    expect(audit[0]?.before).toMatchObject({ status: "disabled" });
    expect(audit[0]?.after).toMatchObject({ status: "active", reason: "employee_reactivated" });
  });

  it("PATCH /employees/:id is one transaction: a failure anywhere saves nothing and sends nothing", async () => {
    // Put the employee back to inactive first (their user is enabled after the previous test).
    await http().patch(`/api/v1/employees/${employeeId}`).set("Authorization", `Bearer ${hrToken}`).send({ status: "inactive" });
    const snapshot = async () => ({
      employee: await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } }),
      user: await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } }),
      audit: await setupPrisma.auditLogEntry.count({ where: { companyId } }),
      links: await setupPrisma.passwordResetToken.count({ where: { userId: employeeUserId } }),
      emails: sentEmails.length,
    });
    const before = await snapshot();
    expect(before.user.status).toBe("disabled");
    const patch = (body: object) =>
      http().patch(`/api/v1/employees/${employeeId}`).set("Authorization", `Bearer ${hrToken}`).send(body);
    const unchanged = async (): Promise<void> => {
      const after = await snapshot();
      expect(after.employee).toEqual(before.employee); // no field, no status, no updatedAt change
      expect(after.user).toEqual(before.user); // same status AND same password hash
      expect(after.audit).toBe(before.audit);
      expect(after.links).toBe(before.links);
      expect(after.emails).toBe(before.emails);
    };

    // (a) the audit write of the access change fails, after the field update, status change and user re-enable
    const audit = app.get(AuditService, { strict: false });
    const original = audit.record.bind(audit);
    const auditSpy = vi.spyOn(audit, "record").mockImplementation(async (companyIdArg, input) => {
      if (input.action === "enable_access") throw new Error("audit store down");
      return original(companyIdArg, input);
    });
    expect((await patch({ status: "active", jobTitle: "Should not stick" })).status).toBe(500);
    auditSpy.mockRestore();
    await unchanged();

    // (b) the email is only queued after commit: run the real link creation, then fail the request
    const link = app.get(IssuePasswordResetLinkUseCase, { strict: false });
    const realExecute = link.execute.bind(link);
    const linkSpy = vi.spyOn(link, "execute").mockImplementationOnce(async (u) => {
      await realExecute(u); // token row written, email registered for after-commit
      throw new Error("failed right after queueing");
    });
    expect((await patch({ status: "active", jobTitle: "Should not stick" })).status).toBe(500);
    linkSpy.mockRestore();
    await unchanged();

    // (c) deactivation side: the listener fails after the field update, so the field update is undone too
    await patch({ status: "active" }); // real restore (user gets active)
    const activeSnapshot = await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const users = app.get(UsersRepository, { strict: false });
    const usersSpy = vi.spyOn(users, "transitionStatus").mockRejectedValueOnce(new Error("database blip"));
    expect((await patch({ status: "inactive", jobTitle: "Should not stick either" })).status).toBe(500);
    usersSpy.mockRestore();
    const afterC = await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(afterC).toEqual(activeSnapshot);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("active");

    // a clean request then commits everything together, and only now is the email queued
    const emailsBefore = sentEmails.length;
    expect((await patch({ status: "inactive", jobTitle: "Left the company" })).status).toBe(200);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).jobTitle).toBe("Left the company");
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("disabled");
    const restored = await patch({ status: "active", jobTitle: "Back again" });
    expect(restored.status).toBe(200);
    expect(restored.body.accessRestored).toBe(true);
    expect(sentEmails.length).toBe(emailsBefore + 1);
    expect(sentEmails[sentEmails.length - 1]?.to).toBe("ahmad@example.com");
  });

  it("status changes only move users they own: an invited user stays invited, an employee without a user is fine", async () => {
    const invited = await setupPrisma.user.create({
      data: { companyId, email: "still-invited@example.com", passwordHash: await hashPassword("password123!"), status: "invited" },
    });
    const make = (no: string, userId?: string) =>
      setupPrisma.employee.create({
        data: {
          companyId,
          employeeNo: no,
          fullNameAr: "س",
          fullNameEn: no,
          nationalId: `12345678${no.slice(-2)}`,
          nationality: "Saudi",
          isSaudi: true,
          hireDate: new Date("2026-01-01"),
          ...(userId ? { userId } : {}),
        },
      });
    const withInvitedUser = await make("E-904", invited.id);
    const withoutUser = await make("E-905");
    const patch = (id: string, status: "active" | "inactive") =>
      http().patch(`/api/v1/employees/${id}`).set("Authorization", `Bearer ${hrToken}`).send({ status });

    expect((await patch(withInvitedUser.id, "inactive")).status).toBe(200);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: invited.id } })).status).toBe("invited");
    expect((await patch(withInvitedUser.id, "active")).status).toBe(200);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: invited.id } })).status).toBe("invited");

    expect((await patch(withoutUser.id, "inactive")).status).toBe(200);
    expect((await patch(withoutUser.id, "active")).status).toBe(200);
  });

  it("employees:update alone can set status active but never restores the login; employees:manage-access can", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "returner@example.com", passwordHash: await hashPassword("returner-password-1"), status: "active" },
    });
    const returner = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-907",
        fullNameAr: "عائد",
        fullNameEn: "Returner",
        nationalId: "1234567897",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: user.id,
      },
    });
    const patch = (token: string, status: "active" | "inactive") =>
      http().patch(`/api/v1/employees/${returner.id}`).set("Authorization", `Bearer ${token}`).send({ status });
    const userStatus = async (): Promise<string> => (await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status;

    expect((await patch(hrToken, "inactive")).status).toBe(200);
    expect(await userStatus()).toBe("disabled");

    // update permission only: the employee is active again, the login is NOT restored, no email
    const emailsBefore = sentEmails.length;
    const flipped = await patch(editorToken, "active");
    expect(flipped.status).toBe(200);
    expect(flipped.body.status).toBe("active");
    expect(flipped.body.accessRestored).toBe(false); // re-activation that did not restore the login
    expect(await userStatus()).toBe("disabled");
    expect(sentEmails.length).toBe(emailsBefore);
    expect((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, user.email), password: "returner-password-1" })).status).toBe(401);

    // the explicit action needs employees:manage-access
    const restore = (token: string) =>
      http().post(`/api/v1/employees/${returner.id}/restore-access`).set("Authorization", `Bearer ${token}`);
    expect((await restore(editorToken)).status).toBe(403);
    expect((await restore(readerToken)).status).toBe(403);
    expect((await restore(hrToken)).status).toBe(204);
    expect(await userStatus()).toBe("active");

    // old password destroyed, link emailed, new password works
    expect((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, user.email), password: "returner-password-1" })).status).toBe(401);
    expect(sentEmails[sentEmails.length - 1]?.to).toBe(user.email);
    expect(
      (await http().post("/api/v1/auth/password-reset/confirm").send({ token: tokenFromLastEmail(), newPassword: "returner-new-password-2" })).status,
    ).toBe(204);
    expect((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, user.email), password: "returner-new-password-2" })).status).toBe(200);

    // nothing left to restore
    const again = await restore(hrToken);
    expect(again.status).toBe(422);
    expect((again.body as { error: { code: string } }).error.code).toBe("employees.access.nothing_to_restore");
  });

  it("ordinary saves report accessRestored: null (not a re-activation)", async () => {
    const res = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ jobTitle: "Senior accountant" });
    expect(res.status).toBe(200);
    expect(res.body.accessRestored).toBeNull();
  });

  it("restore-access: 422 with no account or an inactive employee, 404 across tenants, and it serialises with a concurrent deactivation", async () => {
    const make = (no: string, extra: Record<string, unknown> = {}) =>
      setupPrisma.employee.create({
        data: {
          companyId,
          employeeNo: no,
          fullNameAr: "س",
          fullNameEn: no,
          nationalId: `99999999${no.slice(-2)}`,
          nationality: "Saudi",
          isSaudi: true,
          hireDate: new Date("2026-01-01"),
          ...extra,
        },
      });
    const restore = (id: string) =>
      http().post(`/api/v1/employees/${id}/restore-access`).set("Authorization", `Bearer ${hrToken}`);
    const code = (res: { body: unknown }): string => (res.body as { error: { code: string } }).error.code;

    const noAccount = await restore((await make("E-910")).id);
    expect(noAccount.status).toBe(422);
    expect(code(noAccount)).toBe("employees.access.no_account");

    const user = await setupPrisma.user.create({
      data: { companyId, email: "race@example.com", passwordHash: await hashPassword("race-password-1"), status: "disabled" },
    });
    const inactive = await make("E-911", { userId: user.id, status: "inactive" });
    const notActive = await restore(inactive.id);
    expect(notActive.status).toBe(422);
    expect(code(notActive)).toBe("employees.access.employee_inactive");

    const other = await setupPrisma.company.create({ data: { nameAr: "أخرى", nameEn: "Other" } });
    const foreign = await setupPrisma.employee.create({
      data: {
        companyId: other.id,
        employeeNo: "X-1",
        fullNameAr: "غريب",
        fullNameEn: "Foreign",
        nationalId: "5555555555",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    expect((await restore(foreign.id)).status).toBe(404);

    // A restore and a deactivation at the same moment: the employee row lock serialises them, so whichever
    // order they run in, the end state is "inactive employee, disabled login".
    const raceUser = await setupPrisma.user.create({
      data: { companyId, email: "race2@example.com", passwordHash: await hashPassword("race-password-2"), status: "disabled" },
    });
    const racing = await make("E-912", { userId: raceUser.id });
    const [restoreRes, deactivateRes] = await Promise.all([
      restore(racing.id).then((r) => r),
      http().patch(`/api/v1/employees/${racing.id}`).set("Authorization", `Bearer ${hrToken}`).send({ status: "inactive" }).then((r) => r),
    ]);
    expect(deactivateRes.status).toBe(200);
    expect([204, 422]).toContain(restoreRes.status);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: racing.id } })).status).toBe("inactive");
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: raceUser.id } })).status).toBe("disabled");
  });

  it("a failing restore leaves the login disabled with no usable link (rolled back); earlier reset links are void", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "links@example.com", passwordHash: await hashPassword("links-password-1"), status: "active" },
    });
    const emp = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-913",
        fullNameAr: "روابط",
        fullNameEn: "Links",
        nationalId: "1234567913",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: user.id,
      },
    });

    // a reset link issued BEFORE the deactivation
    await http().post("/api/v1/auth/password-reset/request").send({ identifier: await signInId(setupPrisma, user.email) });
    const oldToken = tokenFromLastEmail();

    expect((await http().patch(`/api/v1/employees/${emp.id}`).set("Authorization", `Bearer ${hrToken}`).send({ status: "inactive" })).status).toBe(200);
    // a disabled account gets no new links from forgot-password
    const emailsBefore = sentEmails.length;
    expect((await http().post("/api/v1/auth/password-reset/request").send({ identifier: await signInId(setupPrisma, user.email) })).status).toBe(204);
    expect(sentEmails.length).toBe(emailsBefore);

    // restore fails at the email step: nothing sent, login disabled again, no live link left
    const queue = app.get(EmailQueueService, { strict: false });
    const failing = vi.spyOn(queue, "enqueue").mockRejectedValueOnce(new Error("redis down"));
    expect((await http().patch(`/api/v1/employees/${emp.id}`).set("Authorization", `Bearer ${hrToken}`).send({ status: "active" })).status).toBe(500);
    failing.mockRestore();
    expect(sentEmails.length).toBe(emailsBefore);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("disabled");
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).status).toBe("inactive");
    expect(await setupPrisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);

    // a proper restore, then the pre-deactivation link is dead and the new one works (once)
    expect((await http().patch(`/api/v1/employees/${emp.id}`).set("Authorization", `Bearer ${hrToken}`).send({ status: "active" })).status).toBe(200);
    const newToken = tokenFromLastEmail();
    const confirm = (token: string) =>
      http().post("/api/v1/auth/password-reset/confirm").send({ token, newPassword: "links-new-password-9" });
    expect((await confirm(oldToken)).status).toBe(401);
    expect((await confirm(newToken)).status).toBe(204);
    expect((await confirm(newToken)).status).toBe(401); // single use
    expect((await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, user.email), password: "links-new-password-9" })).status).toBe(200);
  });

  it("a manager can never restore their own access, by status flip or by the restore action", async () => {
    const own = await setupPrisma.employee.findFirstOrThrow({ where: { companyId, employeeNo: "E-906" } });
    // Their own account was deactivated, but their access token is still within its 15 minutes.
    await setupPrisma.employee.update({ where: { id: own.id }, data: { status: "inactive" } });
    await setupPrisma.user.update({ where: { id: own.userId as string }, data: { status: "disabled" } });
    await app.get(AccessPolicy).invalidateCompany(companyId);

    // The still-valid token is refused outright: access is read live, a disabled user has none (ADR-0011 §4).
    const viaAction = await http().post(`/api/v1/employees/${own.id}/restore-access`).set("Authorization", `Bearer ${selfManagerToken}`);
    expect(viaAction.status).toBe(401);

    // nor can they reinstate themselves by flipping their own status
    const viaStatus = await http()
      .patch(`/api/v1/employees/${own.id}`)
      .set("Authorization", `Bearer ${selfManagerToken}`)
      .send({ status: "active" });
    expect(viaStatus.status).toBe(401);
    expect((await setupPrisma.employee.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("inactive");
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: own.userId as string } })).status).toBe("disabled");

    // someone else sets them active and restores their access
    expect(
      (await http().patch(`/api/v1/employees/${own.id}`).set("Authorization", `Bearer ${editorToken}`).send({ status: "active" })).status,
    ).toBe(200);
    const byOther = await http().post(`/api/v1/employees/${own.id}/restore-access`).set("Authorization", `Bearer ${hrToken}`);
    expect(byOther.status).toBe(204);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: own.userId as string } })).status).toBe("active");
  });

  it("an ordinary save of an active employee never re-enables a disabled user", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "kept-off@example.com", passwordHash: await hashPassword("password123!"), status: "disabled" },
    });
    const employee = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-903",
        fullNameAr: "موقوف",
        fullNameEn: "Kept off",
        nationalId: "1234567894",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: user.id,
      },
    });
    const res = await http()
      .patch(`/api/v1/employees/${employee.id}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "active", jobTitle: "Clerk" }); // the web form always sends status
    expect(res.status).toBe(200);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("disabled");
  });

  it("refresh refuses a disabled user even when their token is still live", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "live-token@example.com", passwordHash: await hashPassword("password123!"), status: "active" },
    });
    const login = await http().post("/api/v1/auth/login").send({ identifier: await signInId(setupPrisma, user.email), password: "password123!" });
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0] as string;
    await setupPrisma.user.update({ where: { id: user.id }, data: { status: "disabled" } });
    expect(await setupPrisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);

    expect((await http().post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect(await setupPrisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("deactivating an employee cancels an invitation that hasn't been accepted yet", async () => {
    const pending = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-901",
        fullNameAr: "معلّق",
        fullNameEn: "Pending",
        nationalId: "1234567892",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
      },
    });
    const invite = await http()
      .post(`/api/v1/employees/${pending.id}/invite`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ email: "pending@example.com" });
    expect(invite.status).toBe(201);
    const token = tokenFromLastEmail();

    const deactivate = await http()
      .patch(`/api/v1/employees/${pending.id}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "inactive" });
    expect(deactivate.status).toBe(200);

    const accept = await http().post("/api/v1/auth/invitations/accept").send({ token, password: "correct-horse-battery" });
    expect(accept.status).toBe(401);
    expect(await setupPrisma.user.count({ where: { companyId, email: "pending@example.com" } })).toBe(0);
  });

  it("deleting an employee also disables their linked user", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "gone@example.com", passwordHash: await hashPassword("password123!"), status: "active" },
    });
    const gone = await setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: "E-902",
        fullNameAr: "محذوف",
        fullNameEn: "Gone",
        nationalId: "1234567893",
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        userId: user.id,
      },
    });
    const res = await http().delete(`/api/v1/employees/${gone.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(204);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("disabled");
  });

  const newEmployee = (no: string, extra: Record<string, unknown> = {}) =>
    setupPrisma.employee.create({
      data: {
        companyId,
        employeeNo: no,
        fullNameAr: "س",
        fullNameEn: no,
        nationalId: `77777${no.replace(/\D/g, "").padStart(5, "0")}`,
        nationality: "Saudi",
        isSaudi: true,
        hireDate: new Date("2026-01-01"),
        ...extra,
      },
    });

  it("saves of one employee wait for each other (row lock), without blocking foreign-key inserts or deadlocking on manager cycles", async () => {
    const [a, b] = [await newEmployee("E-920"), await newEmployee("E-921")];

    // Hold the employee row exactly as a running PATCH would; a PATCH for the same employee must wait for it.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = setupPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${a.id}::uuid FOR NO KEY UPDATE`;
        await tx.employee.update({ where: { id: a.id }, data: { jobTitle: "Set by the earlier save" } });
        locked();
        await held;
      },
      { timeout: 30_000 },
    );
    await isLocked;
    let settled = false;
    const waiting = http()
      .patch(`/api/v1/employees/${a.id}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ jobTitle: "Waited" })
      .then((res) => {
        settled = true;
        return res;
      });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(settled).toBe(false); // serialised behind the lock
    release();
    await holder;
    expect((await waiting).status).toBe(200);
    // The lock is taken BEFORE the employee is read, so the PATCH saw the earlier save (not a stale copy):
    // its audit "before" is what the other transaction committed. (A bare UPDATE would wait too, but would
    // have read `before` first and overwritten blindly.)
    const audit = await setupPrisma.auditLogEntry.findFirstOrThrow({
      where: { companyId, entity: "employees", entityId: a.id, action: "update" },
      orderBy: { at: "desc" },
    });
    expect(audit.before).toMatchObject({ jobTitle: "Set by the earlier save" });

    // Mutual managers at the same moment: with a KEY SHARE-compatible lock nothing deadlocks.
    for (let i = 0; i < 3; i += 1) {
      const [r1, r2] = await Promise.all([
        http().patch(`/api/v1/employees/${a.id}`).set("Authorization", `Bearer ${hrToken}`).send({ managerId: b.id }).then((r) => r),
        http().patch(`/api/v1/employees/${b.id}`).set("Authorization", `Bearer ${hrToken}`).send({ managerId: a.id }).then((r) => r),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
    }
  });

  it("DELETE is one transaction too: a failing access cut-off leaves the employee, their user and the audit untouched", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "delete-fails@example.com", passwordHash: await hashPassword("password123!"), status: "active" },
    });
    const emp = await newEmployee("E-922", { userId: user.id });
    const auditBefore = await setupPrisma.auditLogEntry.count({ where: { companyId } });
    const users = app.get(UsersRepository, { strict: false });
    const failing = vi.spyOn(users, "transitionStatus").mockRejectedValueOnce(new Error("database blip"));
    const res = await http().delete(`/api/v1/employees/${emp.id}`).set("Authorization", `Bearer ${hrToken}`);
    failing.mockRestore();
    expect(res.status).toBe(500);
    expect(await setupPrisma.employee.count({ where: { id: emp.id } })).toBe(1);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("active");
    expect(await setupPrisma.auditLogEntry.count({ where: { companyId } })).toBe(auditBefore);
  });

  it("if queueing the email fails after the commit, the restore stays saved (and the failure is not returned)", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "queue-down@example.com", passwordHash: await hashPassword("password123!"), status: "disabled" },
    });
    const emp = await newEmployee("E-923", { userId: user.id });
    const queue = app.get(getQueueToken(EMAIL_QUEUE), { strict: false }) as { add: (...args: unknown[]) => Promise<unknown> };
    const emailsBefore = sentEmails.length;
    const down = vi.spyOn(queue, "add").mockRejectedValue(new Error("redis down"));
    const res = await http().post(`/api/v1/employees/${emp.id}/restore-access`).set("Authorization", `Bearer ${hrToken}`);
    expect(down).toHaveBeenCalledTimes(3); // retried, then given up
    down.mockRestore();
    expect(res.status).toBe(204);
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("active");
    expect(sentEmails.length).toBe(emailsBefore); // nothing went out; "Forgot password" is the recovery
  });

  it("PATCH/DELETE/restore answer 404 for an unknown employee and 400 for a malformed id", async () => {
    const missing = "0195a1b2-0000-7000-8000-000000000000";
    const call = (method: "patch" | "delete" | "post", id: string) => {
      const suffix = method === "post" ? "/restore-access" : "";
      const r = http()[method](`/api/v1/employees/${id}${suffix}`).set("Authorization", `Bearer ${hrToken}`);
      return method === "patch" ? r.send({ jobTitle: "x" }) : r;
    };
    for (const method of ["patch", "delete", "post"] as const) {
      expect((await call(method, missing)).status).toBe(404);
      expect((await call(method, "not-a-uuid")).status).toBe(400);
    }
  });

  it("lets the employee view (not edit) their salary components", async () => {
    await setupPrisma.salaryComponent.create({
      data: { companyId, employeeId, type: "basic", amountHalalas: 500000n, effectiveFrom: new Date("2026-01-01") },
    });
    const res = await http().get("/api/v1/me/salary-components").set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const write = await http()
      .post(`/api/v1/employees/${employeeId}/salary-components`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "housing", amountHalalas: "1", effectiveFrom: "2026-01-01" });
    expect(write.status).toBe(403);
  });

  it("password reset: same response for known and unknown emails, email only for real accounts, rate limited per email and IP", async () => {
    // Rate-limit counters live in Redis for an hour and are shared across test runs
    // (and with the dev stack), so clear those counters to keep this test repeatable.
    const redis = app.get<Redis>(REDIS_CLIENT);
    const staleIpKeys = await redis.keys("pwreset:*");
    if (staleIpKeys.length > 0) await redis.del(...staleIpKeys);

    const before = sentEmails.length;
    const known = await http().post("/api/v1/auth/password-reset/request").send({ identifier: "hr@example.com" });
    const unknown = await http()
      .post("/api/v1/auth/password-reset/request")
      .send({ identifier: `nobody-${Date.now()}@example.com` });
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(sentEmails.length).toBe(before + 1);
    const email = sentEmails[sentEmails.length - 1];
    expect(email?.to).toBe("hr@example.com");
    expect(email?.text).toContain("http://web.test/reset-password?token=");

    // per-email limit is 5/hour: 1 used above (unique address per run keeps this repeatable)
    const target = `limited-${Date.now()}@example.com`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await http().post("/api/v1/auth/password-reset/request").send({ identifier: target })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
    expect(statuses[5]).toBe(429);
  });

  it("per-IP limit is per real client behind a trusted proxy, not one shared bucket", async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const stale = await redis.keys("pwreset:*");
    if (stale.length > 0) await redis.del(...stale);

    const fromClient = (ip: string, n: number): Promise<number> =>
      http()
        .post("/api/v1/auth/password-reset/request")
        .set("X-Forwarded-For", ip)
        .send({ identifier: `ip-${ip}-${n}-${Date.now()}@example.com` })
        .then((res) => res.status);
    const first: number[] = [];
    for (let i = 0; i < 21; i += 1) first.push(await fromClient("203.0.113.1", i));
    expect(first.slice(0, 20).every((status) => status === 204)).toBe(true);
    expect(first[20]).toBe(429);
    // a different client (same proxy) has its own budget
    expect(await fromClient("203.0.113.2", 0)).toBe(204);
  });
});
