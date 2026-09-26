import { execSync } from "node:child_process";
import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { UsersRepository } from "../src/modules/auth";

/**
 * docs/adr/0004-rls-deferred.md point 4: with RLS off, this test is the real
 * safety net. It must keep passing as every new repository is added.
 */
describe("tenant isolation", () => {
  let container: StartedPostgreSqlContainer;
  let setupPrisma: PrismaClient;
  let usersRepository: UsersRepository;
  let companyAId: string;
  let companyBId: string;

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
    const companyA = await setupPrisma.company.create({
      data: { nameAr: "شركة أ", nameEn: "Company A" },
    });
    const companyB = await setupPrisma.company.create({
      data: { nameAr: "شركة ب", nameEn: "Company B" },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    usersRepository = moduleRef.get(UsersRepository);
  }, 120_000);

  afterAll(async () => {
    // Defensive: if beforeAll threw before assigning these (e.g. no Docker
    // available), don't mask the real error with a secondary crash here.
    await setupPrisma?.$disconnect();
    await container?.stop();
  });

  it("cannot read another company's user through the repository", async () => {
    await usersRepository.create(companyAId, {
      email: "same@example.com",
      passwordHash: "hash-a",
    });
    await usersRepository.create(companyBId, {
      email: "same@example.com",
      passwordHash: "hash-b",
    });

    const fromCompanyB = await usersRepository.findByEmail(companyBId, "same@example.com");
    expect(fromCompanyB?.passwordHash).toBe("hash-b");

    const fromCompanyA = await usersRepository.findByEmail(companyAId, "same@example.com");
    expect(fromCompanyA?.passwordHash).toBe("hash-a");

    // Same email exists in both companies — proves findByEmail(companyB, ...)
    // never leaked company A's row (it would have returned hash-a instead).
    expect(fromCompanyA?.id).not.toBe(fromCompanyB?.id);
  });

  it("cannot find a user that only exists in the other company", async () => {
    await usersRepository.create(companyAId, {
      email: "only-in-a@example.com",
      passwordHash: "hash",
    });

    const result = await usersRepository.findByEmail(companyBId, "only-in-a@example.com");
    expect(result).toBeNull();
  });
});
