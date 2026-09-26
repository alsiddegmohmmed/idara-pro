# apps/api

NestJS (Fastify) API and background worker.

- Stage 1: config (Zod env), Pino logging, typed errors + global exception filter,
  a `Clock` provider, `/health` + `/ready`.
- Stage 3: Prisma schema (companies, branches, users, roles, permissions,
  refresh_tokens, audit_log — see `prisma/schema.prisma`), the tenant-aware
  `withTenant()` data-access layer (`src/shared/database/`), and a seed script.
  RLS is deferred — see `../../docs/adr/0004-rls-deferred.md` for the compensating
  controls and `test/tenant-isolation.e2e.test.ts` for the safety-net test.

No login/refresh/logout endpoints yet — that's Stage 4.

**Local DB setup:** `docker compose -f ../../infra/docker-compose.dev.yml up -d`,
then `pnpm db:migrate` (first run creates the initial migration) and `pnpm db:seed`.

Structure and rules: `../../AGENTS.md` and `../../docs/architecture/overview.md`.
