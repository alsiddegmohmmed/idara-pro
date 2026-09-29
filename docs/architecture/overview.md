# Architecture overview

## Style

Modular monolith (ADR-0001): one NestJS app deployed as `api` (HTTP) and `worker` (jobs)
from the same codebase, one PostgreSQL database, Redis for queues, and uploaded files on local disk behind a `FileStorage` interface (ADR-0005).

```
 Phone / browser (PWA, Arabic RTL)
          │ HTTPS
       [ Caddy ] ── serves web build
          │
   [ api (NestJS) ] ──► PostgreSQL
          │   └──────► Redis (BullMQ) ◄── [ worker (NestJS) ] ──► SMTP, files
          └──────────► files volume (documents, payslips, exports)
```

## Module layout (apps/api/src/modules/<module>/)

```
<module>/
  http/             controllers, request/response DTOs
  application/      use cases, event handlers, repository interfaces (ports)
  domain/           entities, value objects, pure rules (no framework imports)
  infrastructure/   Prisma repositories, BullMQ processors, adapters
  <module>.module.ts
  index.ts          the ONLY file other modules may import
```

Cross-cutting code lives in `apps/api/src/shared/`:
`auth/` (JWT, `@RequirePermission`, guards) · `tenancy/` (request context: companyId, userId) ·
`database/` (Prisma client, `withTransaction`) · `events/` (in-process event bus) ·
`errors/` (typed errors → one JSON error shape) · `config/` (Zod-validated env) · `clock/`.

### Module dependencies (allowed)

```
employees ◄── attendance, leave, custody, payroll, notifications
auth      ◄── employees   (InvitationsService.createForEmployee — docs/adr/0007-invitations.md;
                            the reverse link, accept → employees.user_id, is event-based, no import)
attendance ◄── payroll
leave     ◄── payroll   (and leave → attendance via event `leave.approved`)
custody   ◄── payroll, exports
payroll   ◄── exports
audit, notifications: consume events from everyone
```

`access` owns roles and assignments; the read side (`AccessPolicy`, `DataScope`) lives in `shared/access`
so every module can depend on it without depending on the `access` module itself.
discipline ◄── payroll (approved warnings can suggest a deduction; never create one).

No cycles. Enforced by an ESLint boundaries rule in CI.

## Domain events (in-process in v1)

| Event | Published by | Consumed by |
|---|---|---|
| `employee.created` | employees | audit — not implemented yet; audit is currently always a direct `AuditService.record()` call, not event-driven, and invitations (below) are an explicit HR action, not automatic on creation |
| `invitation.accepted` | auth | employees (link `employees.user_id` — docs/adr/0007-invitations.md) |
| `leave.approved` / `leave.rejected` | leave | attendance (mark days), notifications |
| `custody.approved` / `custody.paid` | custody | notifications |
| `payroll.approved` | payroll | notifications, exports |
| `document.expiring` / `document.expired` | employees (daily job) | notifications |
| `access.changed` (planned) | access (roles, assignments, branch, status) | access snapshot cache invalidation |
| `employee.transferred` (planned) | employees | attendance, leave (open requests), notifications |
| `warning.issued` / `contract.ending` / `insurance.ending` (planned) | discipline / employees (alerts job) | notifications |

Handlers that send email or heavy work enqueue a BullMQ job instead of running inline.

## API conventions

- REST, `/api/v1`, JSON, OpenAPI generated from NestJS decorators.
- Error shape: `{ "error": { "code": "leave.insufficient_balance", "message": "...", "details": {} } }`.
- Cursor pagination: `?limit=50&cursor=<opaque>` → `{ data, nextCursor }`.
- `Idempotency-Key` header on check-in and payroll-run creation.

## Security

- JWT access token (15 min, carries user + company only — no permission list, ADR-0011) + rotating refresh token (httpOnly, Secure, SameSite=Strict cookie),
  reuse detection revokes the whole session family. Argon2id password hashes.
- Login rate limit + lockout. Helmet headers. CORS restricted to the web origin.
- Tenancy: repositories always receive `companyId` from the request context (one tenant = the company;
  branches are a *scope* inside it). PostgreSQL RLS stays deferred (ADR-0004) — revisit at go-live;
  branch and team scope are enforced by `AccessPolicy` (below), not by RLS.
- Sensitive fields (national ID/Iqama, salary, IBAN) need explicit permissions and are masked in lists.
- UI follows the same permissions (never instead of them): `GET /auth/access` returns the caller's
  permissions with scope; the web app shows a page, tab, button or panel only if its endpoint would
  allow it (`can(code, minScope)`), data hooks never call an endpoint the user can't use, and a page
  opened without access shows "no access" instead of redirecting. Sign-in pages (login, accept
  invitation, forgot/reset password) use their own layout and never show the app shell.
- Files served via short-lived signed URLs. Audit log is append-only.
- Saudi PDPL: employee data is personal data; data stays on the company server in KSA.

## Authorization model (ADR-0011)

- **Role** = permissions, each with a reach (`own`/`team`/`branch`/`company`). **Assignment** = user + role
  + where (`home` branch, `selected` branches, dates). Effective reach = union of assignments.
- `shared/access`: `AccessPolicy.scopeFor(user, permission)` → `DataScope`; every repository method for
  employee-owned data takes a `DataScope` and applies it in SQL. Modules never hand-roll scope checks.
- The guard reads the user's **access snapshot** from Redis (DB fallback); any role/assignment/status
  change deletes it, so revocation is immediate. `GET /auth/access` feeds the web UI.
- Sensitive tiers (personal, salary, contracts, insurance, warnings) have their own permissions and are
  masked/omitted by the API; reads of other people's sensitive data are audited.
- New module `access` owns roles, assignments, the policy and the access-review report.
- Where new features live: contracts, insurance, contacts, career history → `employees`; short
  permissions → `leave`; warnings → new `discipline`; adjustments → `payroll`; alert rules → `notifications`.

## Scalability rules

- Every list endpoint: server-side filters + search + **cursor pagination** (`limit` ≤ 100). No
  "load everything, filter in the browser".
- Filters by branch/date use indexed `(company_id, branch_id, date)` columns (snapshot `branch_id`, ADR-0012).
- Reference data (branches, departments, roles) is small and cached; per-user access snapshot cached.
- Heavy work (reports, exports, nightly jobs) runs in the worker, never in a request.
- Sized for: ~500 employees, ~10 branches, ~150 concurrent users on one server. A seeded load test
  (500 employees, 10 branches, 1 year of attendance) must pass before more branches go live.
- **Authorization matrix test** (every route × every default role × in/out of scope) runs in CI and
  fails the build for any route without `@RequirePermission` or a matrix row.

## Frontend (apps/web)

- React + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod (schemas from `packages/shared`).
- Tailwind + shadcn/ui, `dir="rtl"`, i18next with `ar` (default) and `en`.
- `src/features/<module>/` holds pages, hooks and API calls per module; `src/components/` holds shared UI.
- PWA via vite-plugin-pwa; geolocation requires HTTPS.

## Deployment (company server)

Docker Compose: `caddy`, `api` (×2 possible), `worker`, `postgres`, `redis`; files in the `idara_files` volume.
Company has a domain → Caddy gets HTTPS certificates automatically.
Backups: nightly `pg_dump` + copy of the files volume to an off-server location, 30-day retention, monthly restore test.
Environments: dev (local compose), staging, prod. Migrations run on deploy (forward-only).
Observability: Pino JSON logs with request IDs, `/health` + `/ready`, error tracking, alerts on failed jobs/backups.
