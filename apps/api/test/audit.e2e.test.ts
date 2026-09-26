import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuditService } from "../src/modules/audit";

describe("audit", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let auditService: AuditService;
  let companyId: string;

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
    const company = await setupPrisma.company.create({ data: { nameAr: "شركة", nameEn: "Audit Test Co" } });
    companyId = company.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    auditService = moduleRef.get(AuditService);
  }, 120_000);

  afterAll(async () => {
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("writes an append-only entry with before/after snapshots", async () => {
    const entityId = "00000000-0000-0000-0000-0000000000aa";
    await auditService.record(companyId, {
      actorId: null,
      action: "update",
      entity: "employees",
      entityId,
      before: { salary: 1000 },
      after: { salary: 1200 },
    });

    const rows = await setupPrisma.auditLogEntry.findMany({ where: { companyId, entityId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "update",
      entity: "employees",
      before: { salary: 1000 },
      after: { salary: 1200 },
    });
  });
});
