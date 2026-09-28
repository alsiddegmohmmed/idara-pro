import { execSync } from "node:child_process";
import path from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { PrismaClient, type Permission } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { AppModule } from "../src/app.module";
import { UsersRepository } from "../src/modules/auth";
import { EMPLOYEE_ROLE_ID } from "../src/shared/auth/default-roles";
import { parseTrustProxy } from "../src/shared/config/trust-proxy";
import { hashPassword } from "../src/shared/auth/password";
import { EmailQueueService } from "../src/shared/mail/email-queue.service";
import { REDIS_CLIENT } from "../src/shared/queue/redis-client";
import type Redis from "ioredis";
import type { MailMessage } from "../src/shared/mail/mailer";

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
      await setupPrisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      return user.id;
    }
    await userWith("hr@example.com", [
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_INVITE,
      PERMISSIONS.EMPLOYEES_DELETE,
      PERMISSIONS.EMPLOYEES_REVIEW,
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
      .overrideProvider(EmailQueueService)
      .useValue({ enqueue: async (message: MailMessage): Promise<void> => void sentEmails.push(message) })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ trustProxy: parseTrustProxy("loopback") }));
    await app.register(cookie);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const login = async (email: string): Promise<string> =>
      ((await http().post("/api/v1/auth/login").send({ email, password: "password123!" })).body as { accessToken: string })
        .accessToken;
    hrToken = await login("hr@example.com");
    readerToken = await login("reader@example.com");
    editorToken = await login("editor@example.com");
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
    const claims = JSON.parse(Buffer.from(employeeToken.split(".")[1] as string, "base64url").toString()) as {
      sub: string;
      permissions: string[];
    };
    employeeUserId = claims.sub;
    expect(claims.permissions.sort()).toEqual([PERMISSIONS.EMPLOYEES_SELF_SERVICE, PERMISSIONS.NOTIFICATIONS_READ].sort());

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
      .send({ phone: "0500000000", address: "Riyadh", emergencyContactName: "Sara", emergencyContactPhone: "0511111111" });
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
    const login = await http().post("/api/v1/auth/login").send({ email: "ahmad@example.com", password: "correct-horse-battery" });
    expect(login.status).toBe(200);
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0] as string;

    // If disabling the user throws, HR must see an error (not a 200), and can simply save again.
    const users = app.get(UsersRepository, { strict: false });
    const failing = vi.spyOn(users, "setStatus").mockRejectedValueOnce(new Error("database blip"));
    const failed = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "inactive" });
    expect(failed.status).toBe(500);
    failing.mockRestore();
    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("active");

    const retry = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "inactive" });
    expect(retry.status).toBe(200);

    expect((await http().post("/api/v1/auth/login").send({ email: "ahmad@example.com", password: "correct-horse-battery" })).status).toBe(401);
    expect((await http().post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);

    expect((await setupPrisma.user.findUniqueOrThrow({ where: { id: employeeUserId } })).status).toBe("disabled");
    expect(await setupPrisma.refreshToken.count({ where: { userId: employeeUserId, revokedAt: null } })).toBe(0);
    const audit = await setupPrisma.auditLogEntry.findMany({
      where: { companyId, entity: "users", entityId: employeeUserId, action: "disable_access" },
    });
    expect(audit).toHaveLength(1); // the failed first attempt wrote nothing
    expect(audit[0]?.actorId).not.toBeNull();
  });

  it("refresh refuses a disabled user even when their token is still live", async () => {
    const user = await setupPrisma.user.create({
      data: { companyId, email: "live-token@example.com", passwordHash: await hashPassword("password123!"), status: "active" },
    });
    const login = await http().post("/api/v1/auth/login").send({ email: user.email, password: "password123!" });
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
    const known = await http().post("/api/v1/auth/password-reset/request").send({ email: "hr@example.com" });
    const unknown = await http()
      .post("/api/v1/auth/password-reset/request")
      .send({ email: `nobody-${Date.now()}@example.com` });
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
      statuses.push((await http().post("/api/v1/auth/password-reset/request").send({ email: target })).status);
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
        .send({ email: `ip-${ip}-${n}-${Date.now()}@example.com` })
        .then((res) => res.status);
    const first: number[] = [];
    for (let i = 0; i < 21; i += 1) first.push(await fromClient("203.0.113.1", i));
    expect(first.slice(0, 20).every((status) => status === 204)).toBe(true);
    expect(first[20]).toBe(429);
    // a different client (same proxy) has its own budget
    expect(await fromClient("203.0.113.2", 0)).toBe(204);
  });
});
