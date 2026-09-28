/**
 * `pnpm doctor` — checks every local dependency the API needs and says exactly what is wrong.
 * Read-only: it never changes the database. Run from the repo root.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const envFile = resolve(__dirname, "..", ".env");
let failures = 0;
const ok = (msg: string): void => console.log(`  ✔ ${msg}`);
const bad = (msg: string, fix: string): void => {
  failures += 1;
  console.log(`  ✘ ${msg}\n      → ${fix}`);
};
const errText = (e: unknown): string => (e instanceof Error ? e.message.split("\n").filter(Boolean).slice(-1)[0] ?? e.message : String(e));
const userOf = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    return "?";
  }
};

async function main(): Promise<void> {
  console.log("\nIdara Pro — local environment check\n");

  console.log("1. Configuration");
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    ok(`apps/api/.env found`);
  } else {
    bad("apps/api/.env is missing", "cp apps/api/.env.example apps/api/.env");
  }
  const ownerUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  if (!ownerUrl || !appUrl) {
    bad("DATABASE_URL / APP_DATABASE_URL not set", "compare apps/api/.env with apps/api/.env.example");
    return;
  }
  ok(`migrations connect as "${userOf(ownerUrl)}", the app connects as "${userOf(appUrl)}"`);

  console.log("\n2. Database (owner role, used by migrations)");
  const owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  try {
    await owner.$queryRawUnsafe("SELECT 1");
    ok("Postgres is reachable");
  } catch (e) {
    bad(`cannot connect: ${errText(e)}`, "start it: pnpm db:up   (Docker Desktop must be running)");
    await owner.$disconnect();
    return;
  }

  console.log("\n3. Migrations");
  const onDisk = readdirSync(resolve(__dirname, "..", "prisma", "migrations"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  let applied: Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }> = [];
  try {
    applied = await owner.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`);
  } catch {
    applied = [];
  }
  const done = new Set(applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
  const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
  const pending = onDisk.filter((m) => !done.has(m));
  if (failed.length) bad(`failed migration(s): ${failed.join(", ")}`, "tell the developer; do not edit migrations");
  if (pending.length) bad(`${pending.length} migration(s) not applied: ${pending.join(", ")}`, "pnpm db:migrate");
  else ok(`all ${onDisk.length} migrations applied`);

  console.log("\n4. App role (what the API actually uses)");
  const app = new PrismaClient({ datasources: { db: { url: appUrl } } });
  try {
    await app.$queryRawUnsafe("SELECT 1");
    ok(`"${userOf(appUrl)}" can log in`);
  } catch (e) {
    bad(
      `"${userOf(appUrl)}" cannot connect: ${errText(e)}`,
      "the role is created only when the Postgres volume is first made. Reset the dev DB: docker compose -f infra/docker-compose.dev.yml down -v && pnpm db:setup",
    );
  }
  try {
    const tables: Array<{ tablename: string; allowed: boolean }> = await owner.$queryRawUnsafe(
      `SELECT tablename, has_table_privilege($1, format('public.%I', tablename), 'SELECT,INSERT,UPDATE,DELETE') AS allowed
       FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
      userOf(appUrl),
    );
    const missing = tables.filter((t) => !t.allowed).map((t) => t.tablename);
    if (missing.length) {
      bad(
        `"${userOf(appUrl)}" has no access to: ${missing.join(", ")}`,
        `grant it (as the owner): GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${userOf(appUrl)};`,
      );
    } else ok(`"${userOf(appUrl)}" can read/write all ${tables.length} tables`);
  } catch (e) {
    bad(`could not check table privileges: ${errText(e)}`, "is the app role name in APP_DATABASE_URL correct?");
  }

  console.log("\n5. Seed data");
  try {
    const [row] = await owner.$queryRawUnsafe<Array<{ companies: bigint; users: bigint }>>(
      `SELECT (SELECT count(*) FROM companies) AS companies, (SELECT count(*) FROM users) AS users`,
    );
    if (!row || Number(row.companies) === 0) bad("no company in the database", "pnpm db:seed");
    else ok(`${row.companies} company, ${row.users} user(s)`);
    const admin = process.env.SEED_ADMIN_EMAIL;
    if (admin) {
      const found = await owner.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status::text FROM users WHERE email = $1`, admin);
      if (found.length === 0) bad(`admin "${admin}" does not exist`, "pnpm db:seed");
      else ok(`admin "${admin}" exists (status: ${found[0]?.status}); log in with SEED_ADMIN_PASSWORD from apps/api/.env`);
    }
  } catch (e) {
    bad(`cannot read seed data: ${errText(e)}`, "pnpm db:migrate && pnpm db:seed");
  }

  console.log("\n6. Redis (queues, rate limits)");
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    await redis.connect();
    await redis.ping();
    ok("Redis is reachable");
  } catch (e) {
    bad(`cannot connect to ${redisUrl}: ${errText(e)}`, "pnpm db:up");
  } finally {
    redis.disconnect();
  }

  console.log("\n7. API");
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 3000}/health`);
    if (res.ok) ok("API is running on port " + (process.env.PORT ?? 3000));
    else bad(`API answered ${res.status}`, "check the pnpm dev output for errors");
  } catch {
    console.log("  • API is not running (fine if you haven't started pnpm dev yet)");
  }

  await owner.$disconnect();
  await app.$disconnect();
}

main()
  .catch((e) => {
    failures += 1;
    console.error("Unexpected:", e);
  })
  .finally(() => {
    console.log(failures ? `\n${failures} problem(s) found — fix them in order, top first.\n` : "\nEverything looks good.\n");
    process.exit(failures ? 1 : 0);
  });
