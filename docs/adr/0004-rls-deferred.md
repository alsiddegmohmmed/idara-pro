# ADR-0004: PostgreSQL Row-Level Security — deferred, with compensating controls

**Status:** Accepted
**Date:** 2026-09-26
**Deciders:** Siddeg

## Context

ADR-0002 flagged RLS as a Phase 0 decision (`SET LOCAL app.company_id` inside interactive
transactions needs care). Tenant scoping is already a hard rule (AGENTS.md §3 rule 1): every
query filters by `companyId` from the JWT. The question is whether Postgres itself also
enforces this (defense-in-depth) starting now, or whether app-level filtering is enough for
v1 (ADR-0001: one dev, one company today, self-hosted).

## Decision

**Defer RLS.** App-level `companyId` filtering remains the only enforcement mechanism for
now. To keep turning it on later a single migration instead of a redesign, every table and
the data-access layer are built as if RLS were already on:

1. **One tenant-aware access path.** All Prisma access goes through `withTenant(companyId, fn)`
   (`apps/api/src/shared/database/`) — never a raw injected `PrismaClient` in a module.
   `withTenant` opens a transaction and issues `SET LOCAL app.company_id` before running the
   callback, so the session variable RLS policies would read is already being set correctly;
   turning on policies later requires no call-site changes.
2. **`company_id` on every business table**, `NOT NULL`, indexed, and part of composite
   unique constraints where uniqueness is otherwise per-tenant (e.g. `users (company_id, email)`).
   Two tables are intentionally global, not tenant-scoped: `permissions` (the fixed
   `resource:action` catalog, identical for every company — mirrors `packages/shared`'s
   `PERMISSIONS` constant) and system rows of `roles` (`is_system = true`; a company's own
   custom roles do carry `company_id`).
3. **Least-privilege DB role.** The app connects as `idara_app` (`GRANT`ed table privileges,
   not the owner), not the role that runs migrations. RLS policies apply to non-owner roles;
   an owner-role connection silently bypasses `ENABLE ROW LEVEL SECURITY` unless `FORCE` is
   also set. Using a separate app role now means enabling RLS later doesn't also require a
   connection-string change.
4. **A cross-tenant isolation test now**, not deferred with RLS: `apps/api/test/tenant-isolation.e2e.test.ts`
   seeds two companies and proves a repository scoped to company A cannot read or write
   company B's rows. This is the real safety net while RLS is off — it must keep passing as
   every new repository is added.

## Options considered

| Option | Complexity now | Protection today | Path to enable later |
|---|---|---|---|
| **Defer + compensating controls (chosen)** | Low–medium (tenant helper, role, test) | App-level only, tested | One migration: write policies, `ENABLE`/`FORCE ROW LEVEL SECURITY` |
| Enable RLS now | Higher (policy per table, per migration) | App-level + DB-level from day one | N/A — already on |
| Defer with no compensating controls | Lowest | App-level only, untested boundary | Retrofit `company_id` conventions, app role, and tests later under time pressure |

## Consequences

- Easier: fewer moving parts per migration now; matches ADR-0001's "one company today" reality.
- Harder: a bug in a repository's `WHERE` clause is not caught by the database — only by the
  isolation test and code review. The isolation test is therefore not optional test coverage;
  treat a failing or skipped run as a release blocker.
- Revisit when: a second company is onboarded to the same deployment, or before production
  go-live with real payroll/salary data — whichever comes first. At that point, write RLS
  policies against the `app.company_id` session variable `withTenant` already sets and flip
  `ENABLE`/`FORCE ROW LEVEL SECURITY` per table.
