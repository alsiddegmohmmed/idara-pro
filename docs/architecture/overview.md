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

Handlers that send email or heavy work enqueue a BullMQ job instead of running inline.

## API conventions

- REST, `/api/v1`, JSON, OpenAPI generated from NestJS decorators.
- Error shape: `{ "error": { "code": "leave.insufficient_balance", "message": "...", "details": {} } }`.
- Cursor pagination: `?limit=50&cursor=<opaque>` → `{ data, nextCursor }`.
- `Idempotency-Key` header on check-in and payroll-run creation.

## Security

- JWT access token (15 min) + rotating refresh token (httpOnly, Secure, SameSite=Strict cookie),
  reuse detection revokes the whole session family. Argon2id password hashes.
- Login rate limit + lockout. Helmet headers. CORS restricted to the web origin.
- Tenancy: repositories always receive `companyId` from the request context. PostgreSQL RLS on
  business tables as a second safety net (`SET LOCAL app.company_id` per transaction) — Phase 0 decision to confirm.
- Sensitive fields (national ID/Iqama, salary, IBAN) need explicit permissions and are masked in lists.
- Files served via short-lived signed URLs. Audit log is append-only.
- Saudi PDPL: employee data is personal data; data stays on the company server in KSA.

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
