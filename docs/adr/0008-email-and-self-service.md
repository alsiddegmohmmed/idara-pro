# ADR-0008: Email delivery, employee self-service, and HR review

**Status:** Accepted
**Date:** 2026-09-28
**Deciders:** Siddeg

## Context
After Stage 3 an invitation or password-reset token was only *logged* — no email
existed — and an invited employee's account had **zero permissions** (confirmed live
in Stage 3), so it could not even open its own profile. Stage 4 makes Phase 1 usable
end to end: real email, employee self-service, and an HR review step for the two
sensitive things an employee can submit (IBAN, documents). Rules:
`docs/domain/business-rules.md` "Employee onboarding".

## Decision

**Mailer port + Nodemailer, sent from the worker queue.** `Mailer` (`shared/mail/mailer.ts`)
is the only thing application code sees; `NodemailerMailer` is the one adapter
(`SMTP_*` env; empty user/pass = no auth, which is what dev Mailpit needs). The
message is fully rendered *before* enqueueing (plain template functions, bilingual —
Arabic RTL first, English beneath, since no per-user language preference exists), so
the `email` queue's `SendEmailProcessor` is dumb: "send this exact email", with BullMQ
retries/backoff. A slow or failing SMTP server never blocks or fails an HTTP request.

**Amends ADR-0006: the HTTP API now produces jobs, still never consumes them.**
ADR-0006 said the API process never touches Redis. That was about not running a
`WorkerHost`; producing was simply never needed until an HTTP request had to trigger
background work. `QueueModule` (Redis + BullMQ root config) is now imported by both
processes; `EmailQueueModule` (enqueue-only) by `AuthModule`; every `WorkerHost`
processor stays in worker-only `*JobModule`s (`SendEmailJobModule`,
`DocumentExpiryJobModule`). The API also uses Redis for rate limiting. Consequence: the
API's tests and CI need a Redis on localhost (CI gets a `redis` service).

**Forgot-password**: identical response for known/unknown emails (the use case already
did this); now rate-limited per email (5/hour) and per IP (20/hour) with a Redis fixed
window (`RateLimiter`, `INCR` + `EXPIRE NX` in one `MULTI`), checked *before* the user
lookup so the limit behaves the same for real and unknown addresses. Fails closed.
Invitation tokens are 72 hours (was 7 days), one-time, re-sendable.

**Review split: what the employee changes vs. what HR changes.** An employee's IBAN
submission and self-uploaded documents are `pending_review`; the previously approved
`iban` stays the effective one until HR approves. HR entering an IBAN or uploading a
document directly is trusted and applies immediately — HR approving its own action would
be circular. Contact fields (phone, personal email, address, emergency contact) apply
immediately with no review. Rejections require a reason, stored (`ibanReviewReason`,
`reviewReason`) so the employee sees it on their profile; the employee is notified
(in-app, via the event bus: `employee.review_decided` → notifications listener, no
import either way) on **both** approval and rejection. Every step is audited; audit
entries carry only the last 4 characters of any IBAN.

**Decisions are atomic and name what the reviewer saw.** IBAN approve/reject bodies carry
`expectedIban`; the write is one conditional `UPDATE ... WHERE status = pending_review AND
pending_iban = <expected>`, so a resubmission between "open" and "click", or two reviewers
deciding at once, yields a 422 (`employees.iban.changed`) instead of approving an IBAN nobody
looked at. Documents get the same `WHERE review_status = pending_review` guard. Setting an
IBAN *directly* (create/update employee) needs `employees:review` — enforced in the API,
not just hidden in the form — and supersedes any pending submission.

**Self-service is self-scoped by construction.** `/api/v1/me/*` has no `:employeeId`;
each call resolves "my employee record" from the caller's user id, gated by a new
`employees:self-service` permission (`employees:review` gates HR's queue). The employee
can *view* their salary components (read-only) but no route lets them write HR fields —
`MyProfileUpdateSchema` is `.strict()`.

**IBAN**: one Saudi-IBAN check in `packages/shared` (normalize → `^SA\d{4}[A-Z0-9]{18}$`
→ ISO 13616 mod-97) used by the web form and the API. Shown in full only to the
employee and `employees:review` holders; masked (`SA•• •••• ••••1234`) in every other
`employees:read` response.

**Uploads (HR and self-service)**: max 10 MB, PDF/JPG/PNG only, identified by magic
bytes — the client's MIME type and extension are never trusted; the stored/served
content type is the detected one. Hand-rolled for these three formats rather than the
ESM-only `file-type` package (this API compiles to CommonJS).

**Default Employee role.** Accepting an invitation assigns the system role `Employee` (fixed
id, `shared/auth/default-roles.ts`) with exactly `employees:self-service` + `notifications:read`.
It is created by a **data migration** (`20260928090000_seed_employee_role`, idempotent, also
backfills invited users that have no role), because production is only ever migrated, never
seeded. The role is assigned *before* the invitation is consumed and a missing role fails the
acceptance loudly, so an invitation is never burned on an account with no permissions.

**Behind Caddy, the client IP comes from `X-Forwarded-For`.** `TRUST_PROXY` (CIDR list; prod
compose trusts the private Docker ranges, the API port is never published) feeds Fastify's
`trustProxy`; empty (dev/tests) trusts nobody, so the header can't be spoofed. Without it every
user would share Caddy's address and the per-IP limit would be one global bucket.

**Email jobs contain live links**, so completed jobs are not retained in Redis and failed ones
only for an hour; retries run ~20 minutes (8 attempts, exponential from 10 s).
Reviewers need `employees:read` as well as `employees:review` to download a document.

## Consequences
- Easier: invite → email → set password → complete profile → HR approves works end to
  end; more self-service features later just add permissions to the Employee role.
- Harder: the API now depends on Redis being up for invitations and password reset
  (enqueue) and forgot-password (rate limit). Same dependency the worker already had.
- Known gaps, deliberately not fixed here: an HR user who is also an invited employee can approve
  their *own* submission (no rule says otherwise — decide with the owner); terminated employees
  keep self-service; the review queue is not paginated; Redis has no password; IBANs are stored
  as plaintext columns; the forgot-password response time differs slightly for known emails.
- Revisit when: a per-user language preference exists (email language), real SMTP
  credentials are set for prod (`SMTP_*` in prod compose), or rate limiting is wanted on
  login/accept as well (only forgot-password today).
