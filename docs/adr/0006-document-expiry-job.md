# ADR-0006: Document expiry-check job — worker process, event bus, BullMQ scheduling

**Status:** Accepted
**Date:** 2026-09-27
**Deciders:** Siddeg

## Context
Employee documents (Iqama, passport, contract, etc.) have an `expiryDate`.
`docs/domain/business-rules.md` calls for reminders at 60/30/7 days before expiry
(exact thresholds marked TBD) but nothing checks them yet. This is the first
background job in the codebase, the first real use of BullMQ/Redis (Redis has been
running in dev since ADR-0002 but nothing connects to it), and the first real use of
the event bus (`EventEmitterModule`, wired up since Phase 0 but never emitted to) and
`companies.timezone` (a schema column, never read).

## Decision

**Scope for this change**: a `Notification` model, `NotificationsService.notifyRecipients()`,
and two HTTP endpoints (list mine, mark read) — enough to make the job observable
with no frontend and no email channel yet. Notification preferences/opt-out, an
email channel, and every other event type (`employee.created`, `leave.approved`,
etc.) stay unbuilt until their own phases — `docs/roadmap.md` files the full
"Notifications (in-app + email)" module under Phase 3.

**Employees emits, Notifications listens — no cross-module import either direction.**
`docs/architecture/overview.md`'s module graph already names `notifications: consume
events from everyone`. `CheckDocumentExpiriesUseCase` (in `employees`) calls
`eventEmitter.emitAsync("document.expiring" | "document.expired", payload)` —
`emitAsync`, not `emit`, so writing the dedup row only after the notification has
actually been created is a real ordering guarantee, not a race. `NotificationsModule`
listens via `@OnEvent(...)` and defines its own local copy of the payload shape
rather than importing a type from `employees` — a deliberate small duplication in
exchange for the two modules never needing to know about each other at all.

**A separate worker process runs the job — the HTTP API never touches Redis.**
`apps/api/src/worker.ts` (`NestFactory.createApplicationContext`, no HTTP listener)
boots `WorkerModule`, which is the only place `QueueModule` (wraps
`BullModule.forRootAsync`, one shared `ioredis` connection with
`maxRetriesPerRequest: null`, as BullMQ's `Worker` requires) and
`DocumentExpiryJobModule` (the `BullModule.registerQueue` + `WorkerHost` processor)
get imported. `EmployeesModule` and `AppModule` stay free of any BullMQ import, so
the job can only ever run in the worker process — never accidentally twice.
`apps/api`'s `dev` script now runs both processes via `concurrently`, and
`infra/docker-compose.prod.yml` gets a real `worker` service (same image as `api`,
`command: ["node", "dist/worker.js"]`).

**Scheduling uses BullMQ's Job Scheduler**, not a second scheduler library and not
the older `repeat`+fixed-`jobId` pattern: `queue.upsertJobScheduler("document-expiry-daily",
{ pattern: DOCUMENT_EXPIRY_CRON, tz: "Asia/Riyadh" }, { name: "check", data: {} })` on
worker startup. It's a true upsert keyed by scheduler id, so restarting the worker —
or later changing `DOCUMENT_EXPIRY_CRON` — updates the same schedule in place instead
of risking a duplicate.

**Dedup is `daysLeft <= threshold`, not `daysLeft === threshold`.** A
`DocumentExpiryNotice` row (`documentId`, `thresholdDays`, unique together;
`thresholdDays = -1` is a reserved sentinel meaning "the one-time expired notice was
sent") is the idempotency record. Using `<=` instead of exact equality means a
threshold crossed while the worker wasn't running (laptop off, server restart) still
fires on the next run instead of being silently skipped forever. Consequence, stated
plainly: a document that's gone unchecked past several thresholds fires all of the
missed ones at once on catch-up (e.g. 60+30+7-day reminders together) — correct and
intentional, just noisy in that specific recovery scenario. Already-expired documents
get exactly one additional "expired" notice via the same mechanism.

**Recipients are permission-based, not role-name-based.** `Role.name` is a free-form,
per-company string in this schema (only "Owner" exists today) — not a controlled
vocabulary — so "who should know about this" is implemented as *whoever holds
`PERMISSIONS.EMPLOYEES_READ` in that company* (a new `UsersRepository.findByPermission`,
the inverse of the existing `findPermissionCodes`), plus the affected employee's own
linked user account when one exists (`EmployeeDocument.employee.userId`), deduped by
user id. No notification-preference or opt-out table exists yet — this is a
deliberate v1 simplification, not an oversight.

**System-actor audit convention.** Every notice sent writes an audit entry via the
already-existing `AuditService`, with `actorId: null`. This codebase's audit entries
are otherwise always written with a real authenticated user's id (from the JWT) — so
`null` is already, today, an unambiguous signal for "a background job did this," not
a bug or missing data.

**`type` is a free-form string, not a Prisma enum.** Future phases keep adding event
types from other modules (leave, custody, attendance); a shared enum would force
every one of them to edit this one central enum, fighting the module-boundary rule.
`titleKey`/`bodyParams` (not pre-rendered `title`/`body` text) so the frontend can
render in the viewer's own locale later, matching AGENTS.md's "never hardcode ar/en
strings" convention — a deliberate change from `docs/architecture/data-model.md`'s
original, plainer sketch.

**Company-local "today."** `companies.timezone` (schema default `"Asia/Riyadh"`,
unused until now) drives `companyDateOnly()`, a new pure helper converting a
`Clock`-sourced instant to the UTC-midnight Date representing that calendar day in
the company's timezone — matching how Postgres `@db.Date` columns round-trip through
Prisma. A new `CompaniesService.findById` (`CompanyModule`) is the first thing to
read the `Company` row itself, rather than one of its sub-resources.

**Cross-tenant company listing.** The job must run once per company, with no
logged-in user to source a `companyId` from. `TenantDatabase.withoutTenant()` was
previously documented as restricted to exactly one case (pre-auth email lookup); a
new `listCompanyIds()` is a second, equally narrow, equally documented exception —
legitimate because `Company` *is* the tenant boundary, not sub-tenant data, so
listing it isn't the kind of cross-tenant leak that listing another company's
employees would be. Every subsequent read/write for that company still goes through
`withTenant(companyId, ...)` like everything else.

## Options considered
| Option | Why not |
|---|---|
| Run the check inside the HTTP API process (e.g. `@nestjs/schedule` cron) | Ties a scheduled job's failure/restart behavior to the request-serving process; the repo map (AGENTS.md) already anticipates a separate worker |
| Direct DI from `employees` into `notifications` (call `NotificationsService` directly) | Inverts `docs/architecture/overview.md`'s documented module graph (`notifications` consumes events from everyone, is never imported by a producer) |
| `daysLeft === threshold` exact match | Silently skips a reminder forever if the worker is down on the exact day a threshold is crossed |
| A Prisma enum for `Notification.type` | Every future module adding an event type would need to edit this one shared enum |
| Role-name matching ("Owner", "HR") for recipients | `Role.name` isn't a controlled vocabulary in this schema — a company could name it anything |

## Consequences
- Easier: the worker process pattern is now established for Phase 2's "nightly
  absence + missing check-out job" — same shape, same `QueueModule`.
- Harder: two processes to run and deploy instead of one; `bash start.sh` and
  `infra/docker-compose.prod.yml` both need to actually start the worker, or
  reminders silently never fire — verified in this change (worker starts via
  `pnpm dev`'s `concurrently`, and via a real `worker` compose service in prod).
- Revisit when: real notification-preference/opt-out is needed (Phase 3), an email
  channel is added (Phase 3), or the "HR/Owner" recipient rule turns out to need
  actual role-name matching instead of a permission proxy.
