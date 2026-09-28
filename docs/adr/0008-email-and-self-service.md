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


**Stage 4.1 follow-ups.**
- *No self-review (four eyes):* approving/rejecting your own IBAN or document is a 403
  (`employees.review.own_submission`); the queue marks such rows `isOwn` and the UI shows a note
  instead of buttons. The same check closes the side doors on your own record: setting your own IBAN
  through `PATCH /employees/:id`, and HR-side document upload/update. An HR user who is also an
  employee therefore needs a second reviewer, and uses `/me` for their own data.
- *Deactivation cuts access:* saving an employee with `status = inactive` (or deleting them) emits
  `employee.deactivated`; the auth module's listener cancels any unaccepted invitation, disables the
  linked user, revokes every refresh token and audits `disable_access`. Login → 401 and refresh → 401
  (refresh re-checks user status *before* rotating). It fires on every inactive save, so a failed
  attempt is completed by simply saving again.
  - **Listeners must not swallow errors.** `@nestjs/event-emitter` logs and *suppresses* handler
    errors by default, so `emitAsync` alone does not propagate them. Listeners whose failure has to
    reach the caller use `@OnEvent(..., { suppressErrors: false })`: `employee.deactivated`,
    `invitation.accepted` (the accept use case relies on it to roll back) and `document.expiring` /
    `document.expired` (the expiry job writes its dedup row only after a successful notify).
  - **Access-token window:** an access token already issued stays valid for its 15 minutes
    (ADR-0002); the guard does not look up user status. For an HR user who is also an employee that
    includes review and PII access during those minutes. Accepted for v1; a short deny-list checked in
    the guard is the fix if it isn't acceptable.
  - **Restoring access (decided by the owner):**
    1. *Its own permission.* Setting an employee back to `active` needs `employees:update`; **restoring
       their login needs `employees:manage-access`** (migration `20260928120000_add_manage_access_permission`
       grants it to the Owner role and any role named "HR", idempotently; other roles get it only when
       an admin assigns it). With update permission alone the status flips and the response says
       `accessRestored: false`; the login stays disabled until someone with manage-access acts, either by
       re-activating the employee or through `POST /employees/:id/restore-access`. **Nobody can restore
       their own access** (403 `employees.access.own_account`; a status flip on your own record never
       restores it either).
    2. *The old password never comes back.* Restoring access revokes all sessions, replaces the password
       with an unguessable random one (old password → 401), re-enables the user and emails the normal
       password-reset link (same email/flow as forgot-password, valid 1 hour; after that the person
       uses "Forgot password"). Audited as `enable_access` with `passwordInvalidated`/`passwordLinkEmailed`.
    - Mechanics: only a `disabled` user is restored (an `invited` one never is; deactivation likewise only
      disables `active` users). Restoring is one atomic statement (status → active *and* the random
      password, only if still `disabled`), preceded by revoking sessions and voiding every unused reset
      link, and followed by the audit entry and, last, the email — the one step that can't be undone.
      Deactivation also voids unused reset links, and forgot-password issues nothing for a disabled
      account, so no link from before a deactivation survives a restore. Confirming a reset is now
      atomic single-use, refuses a disabled account and signs out every session.
    - Invariant: **an inactive employee never has a usable login.** If restoring fails (email queue,
      audit) the user is put back to disabled (best effort, logged, never masking the original error),
      and on a status flip the employee is rolled back to inactive (audited `revert_status`). After a
      restore, both paths re-check the employee wasn't deactivated concurrently and re-apply the
      deactivation. If the event has no listener at all the call fails loudly instead of reading as
      "nothing to restore".
    - **Nobody changes their own status** (403 `employees.status.own_record`): a just-deactivated person
      whose access token is still valid can't reinstate themselves.
    - The `accessRestored` field of `PATCH /employees/:id` is `null` unless the save was an
      inactive→active re-activation, then `true`/`false`.
    - Accepted limits: the PATCH is not a single transaction (other fields in a failed request stay
      saved); a failed attempt that got past the password step leaves the old password destroyed (the
      user stays disabled anyway); the permission migration matches roles named "HR" in every company
      (there is no role-admin API yet, so only DB-created roles can match) and existing HR users see the
      new permission only after their next token refresh (≤ 15 minutes); the stale-access-token window
      also lets a just-deactivated manage-access holder act for up to 15 minutes.
- *Redis password in prod:* `redis-server` with `requirepass`; `REDIS_URL` carries it for api
  and worker. `REDIS_PASSWORD` must be set (compose fails fast) and must be URL-safe (letters and
  digits) because it is embedded in `REDIS_URL`; a malformed `REDIS_URL` (e.g. an unencoded `@` or `/`)
  now fails startup with a clear message that never echoes the value (`shared/config/redis-url.ts`). The config reaches Redis on stdin, so the secret is
  not in the process arguments. Dev Redis stays passwordless.
- *Reviewers download queued documents* via `GET /review-queue/documents/:employeeId/:id/file`
  (`employees:review` only, and only while the document is still pending) — no `employees:read`
  needed. Downloads are audited like any other.

## Consequences
- Easier: invite → email → set password → complete profile → HR approves works end to
  end; more self-service features later just add permissions to the Employee role.
- Harder: the API now depends on Redis being up for invitations and password reset
  (enqueue) and forgot-password (rate limit). Same dependency the worker already had.
- Deferred on purpose (owner's decisions):
  - **Review queue pagination** — the queue returns everything; fine at ≤ 40 employees. Add cursor
    pagination (AGENTS.md §4) if the headcount grows or the queue routinely exceeds a screenful.
  - **IBAN stored as plaintext columns** — accepted for v1. Compensating control, a **go-live
    requirement** (see the go-live checklist in `docs/roadmap.md`): database and file backups are
    encrypted and stored off-site. Revisit column-level encryption before payroll export to a bank.
  - The forgot-password response is slightly slower for a known email than an unknown one.
- Revisit when: a per-user language preference exists (email language), real SMTP
  credentials are set for prod (`SMTP_*` in prod compose), or rate limiting is wanted on
  login/accept as well (only forgot-password today).
