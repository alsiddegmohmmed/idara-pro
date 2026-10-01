# AGENTS.md — Rules for AI agents working in this repo

This file is the contract for any AI coding agent (Claude Code, Codex, Cursor, etc.).
Read it fully before changing code. If a rule here conflicts with a request, stop and ask.

## 1. What this product is

**Idara Pro (إدارة برو)** is the company's **HR and employee-operations platform**:
employees, GPS attendance, leave, short permissions, warnings, contracts, insurance, custody requests,
deductions, payroll preparation, alerts, notifications.

**One company, many branches.** Employees belong to a branch; ~95% of users may only see their own
branch, senior managers see all. More branches are connected later without code changes.
Access model: `docs/adr/0011-access-control.md`. Plan: `docs/roadmap.md`.

It is **NOT an accounting system.** The company uses **Techno Link** for accounting
(expenses, receipts, sales, purchases, suppliers, inventory, VAT). Never build features
that duplicate Techno Link. In v1 the two systems meet only through an **Excel export**
(approved payroll + paid custody) that the accountant enters manually.

Full spec: `docs/product/spec.md`. Business rules: `docs/domain/business-rules.md`.
Glossary (Arabic ↔ English): `docs/domain/glossary.md`.

## 2. Architecture in one minute

- **Modular monolith** (ADR-0001). One NestJS API, one PostgreSQL DB, one worker process.
- Modules: `auth`, `access`, `company`, `employees`, `attendance`, `leave`, `custody`, `discipline`,
  `payroll`, `exports`, `notifications`, `audit`. (`access` = roles, assignments, `AccessPolicy`.)
- Every module has 4 layers. Dependencies point **inward only**:

  ```
  http  →  application  →  domain  ←  infrastructure
  ```

  | Layer | Contains | Must NOT |
  |---|---|---|
  | `http/` | controllers, DTOs, guards usage | contain business logic or Prisma calls |
  | `application/` | use cases (`ApproveLeave`), transactions, event publishing | import Prisma directly (use repository interfaces) |
  | `domain/` | entities, value objects, pure rules | import NestJS, Prisma, HTTP, dates from system clock |
  | `infrastructure/` | Prisma repositories, jobs, email, storage adapters | be imported by other modules |

- A module talks to another module **only through that module's `index.ts` public API**
  (its exported service) or through **domain events**. Never import another module's
  repositories, Prisma models, or internal files.

Details: `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/adr/`.

## 3. Hard rules (never break these)

1. **Tenant scoping:** every query filters by `companyId` taken from the request context
   (the JWT), never from the request body or query string.
2. **Authorization on the server:** every endpoint declares `@RequirePermission(...)`.
   Hiding UI is not security.
3. **Money** is stored and computed as integer **halalas** (`bigint`/`BigInt`). Never floats.
4. **Time:** store instants as UTC `timestamptz`. Work days are `date` in the company
   time zone (`Asia/Riyadh`). Never use the server's local time zone. Inject a `Clock`
   in domain/application code so tests can control "now".
5. **Validation:** every request body/query is validated with a Zod schema from
   `packages/shared`. Unknown fields are rejected.
6. **Audit:** create/update/delete on employees, salary components, attendance corrections,
   leave decisions, custody, and payroll must write an audit entry (before/after).
7. **Payroll runs are immutable once approved.** Corrections = a new adjustment run.
8. **No secrets in code or git.** Use env vars validated at startup (`shared/config`).
9. **Migrations are forward-only.** Never edit a migration that has been merged.
10. **Do not add accounting features** (ledgers, invoices, vendors, expenses, VAT).
    If a task seems to need one, stop and ask.
11. **Data scope:** every read/list/write of employee-owned data takes a `DataScope` from
    `AccessPolicy` (own / team / branch / company reach). Modules never hand-roll scope checks;
    a repository method for employee data without a `DataScope` parameter is a bug (ADR-0011).
12. **Sensitive data has its own permission** (personal data, salary, contracts, insurance,
    warnings, IBAN). The API masks or omits it server-side — never rely on the UI to hide it.
13. **Every endpoint is in the authorization matrix test.** CI fails on a route without
    `@RequirePermission` or without a matrix row.

## 4. Coding conventions

- TypeScript `strict: true`. No `any` (use `unknown` + narrowing). No non-null `!` unless justified in a comment.
- Names: files `kebab-case.ts`; classes `PascalCase`; functions/vars `camelCase`;
  DB tables/columns `snake_case` (map in Prisma with `@@map`/`@map`).
- Use-case classes are verbs: `ApproveLeaveRequest`, `RecordCheckIn`, `CalculatePayrollRun`.
- Errors: throw typed errors from `shared/errors` (`NotFoundError`, `ForbiddenError`,
  `BusinessRuleError` with an i18n `code`). Never throw raw strings or leak Prisma errors.
- API: REST under `/api/v1`, plural nouns (`/leave-requests`), actions as sub-resources
  (`POST /leave-requests/:id/approve`). Cursor pagination. OpenAPI must stay accurate.
- Idempotency: `POST /attendance/punches` and `POST /payroll-runs` accept an `Idempotency-Key` header.
- UI text: never hard-code Arabic/English strings in components; use i18n keys (`ar` is default, RTL).
- Keep functions small; prefer pure functions for rules. No clever abstractions without a second use case.

## 5. Testing rules

- **Domain rules** (late minutes, working days, net salary, distance check): unit tests
  with concrete numbers and edge cases (midnight, weekends, holidays, month boundaries).
- **Use cases / endpoints:** integration tests against a real Postgres (Testcontainers).
- **Authorization matrix:** every route × every default role × in-scope and out-of-scope record
  (allow/deny table in one file). Plus cross-tenant and cross-branch isolation tests.
- Every bug fix starts with a failing test.
- Test names describe behaviour: `rejects check-in when distance exceeds branch radius`.

## 6. How to work (workflow for agents)

1. **Read before writing:** the relevant module folder, `docs/domain/business-rules.md`, and related ADRs.
2. **Plan first** for anything bigger than a small fix: list files to change, schema changes,
   tests to add. Wait for approval if the plan changes the data model, permissions, or an ADR.
3. **One module per change** when possible. Keep diffs reviewable (< ~400 lines when possible).
4. **Run the checks** before saying you are done:
   `pnpm lint && pnpm typecheck && pnpm test`
5. **Update docs** in the same change when behaviour, schema, or decisions change
   (spec, business rules, data model, or a new ADR in `docs/adr/`).
6. **Commits:** Conventional Commits, e.g. `feat(leave): approve and reject requests`,
   `fix(attendance): reject punches with poor GPS accuracy`.
7. If a business rule is unknown (marked **TBD** in the docs), **do not invent it**.
   Make it a setting or leave a clearly named TODO and tell the human.

## 7. Commands (once the codebase is scaffolded)

```bash
pnpm install              # install all workspaces
pnpm db:setup             # first time: start postgres/redis/mailpit, apply migrations, seed the dev admin
pnpm db:migrate           # after pulling new migrations
pnpm db:seed:demo         # optional: fill the database with demo data (1 branch, 28 employees, a month of activity)
pnpm checkup              # something broken locally? checks DB, migrations, roles, seed, Redis, API
pnpm dev                  # api + web in watch mode (always the latest code — use this day to day)
pnpm build                # build everything (shared, api, web)
pnpm start                # run the built app: api + worker on :3000, web on http://localhost:5173
pnpm lint                 # eslint (includes module-boundary rules)
pnpm typecheck            # tsc --noEmit in all packages
pnpm test                 # unit + integration tests
pnpm --filter @idara-pro/api db:migrate                 # apply pending migrations (dev DB)
pnpm --filter @idara-pro/api exec prisma migrate dev --name <change>   # create a new migration
```

## 8. Repo map

```
apps/api/         NestJS API + worker (see apps/api/README.md)
apps/web/         React + Vite PWA, Arabic RTL (see apps/web/README.md)
packages/shared/  Zod schemas, types, permission names, enums shared by api + web
infra/            docker compose, Caddy, backup scripts
docs/             product spec, architecture, ADRs, domain rules, roadmap
.claude/          Claude Code settings, slash commands, subagents
```
