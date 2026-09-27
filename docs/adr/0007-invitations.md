# ADR-0007: Invitations — auth owns the token, employees owns the precondition

**Status:** Accepted
**Date:** 2026-09-27
**Deciders:** Siddeg

## Context

`Employee.userId` (nullable, unique) has been in the schema since Phase 0 but is set
nowhere outside the seed script. `UserStatus.invited` exists but is never used.
`docs/product/spec.md`'s only invitations text is one phrase: `"invite by email,
reset password"`. `docs/architecture/data-model.md` sketches an `invitations` table
keyed by `employee_id` + a raw `email` (not `user_id`, since no `User` exists yet at
invite time) — that table doesn't exist until this change.

This mirrors the existing password-reset flow closely: same opaque-token mechanics
(`shared/auth/opaque-token.ts` — `generateOpaqueToken()`/`hashOpaqueToken()`, an
HMAC-SHA256 keyed with `JWT_REFRESH_SECRET`, chosen because these are high-entropy
random strings, not user-chosen passwords, so a fast keyed hash is correct — see that
file's own comment), same "no email infrastructure exists" placeholder
(`RequestPasswordResetUseCase` has had `TODO(notifications module, Phase 3): send this
by email instead of logging it.` since Phase 0, unchanged).

## Decision

**`auth` module owns the `Invitation` entity and all token mechanics**, exactly
parallel to `PasswordResetToken`. `auth` never touches the `employees` table.

**`employees` module owns the employee-side precondition** (exists, active, not
already linked — `assertCanInviteEmployee`) and calls `auth`'s exported
`InvitationsService.createForEmployee()` directly — a new one-directional
`employees → auth` dependency, added to `docs/architecture/overview.md`'s dependency
graph. This is a direct call, not an event, because the HTTP caller (HR) needs a
synchronous, correctly-typed error for real failure modes (employee already linked,
employee inactive, email already used by another account in this company — checked at
invite time, not left to surprise the invitee weeks later at accept time).

**Accepting an invitation creates the `User` in `auth`, then emits
`invitation.accepted`** (`{companyId, employeeId, userId}`) via the existing global
`EventEmitter2`, `emitAsync`-ed so a failure to link surfaces as a real error rather
than a silent half-state. `employees` listens (`LinkEmployeeUserListener`) and calls a
new, narrow `EmployeesRepositoryPort.linkUser()` — never reachable through
`UpdateEmployeeSchema`/the public PATCH endpoint (letting any `employees:update`
holder link an arbitrary employee to an arbitrary user id would be a serious
authorization hole). This direction needs zero import, mirroring Stage 2c's
`employees → notifications` event pattern, just reversed.

**Why not route through the `notifications` module** (as
`docs/architecture/overview.md`'s original, pre-Stage-2c sketch of `employee.created`
implied)? Stage 2c scoped `Notification` to `recipientUserId`-keyed rows for users who
already exist — an invitee has no `User` yet, so today's notifications module
literally cannot represent "notify this email address." The event table's
`employee.created | employees | notifications (invite)` row is corrected in this
change to say plainly that it isn't implemented (audit, the other claimed consumer,
has also always been a direct call in this codebase, never event-driven).

**No automatic invite on employee creation.** `Employee` has no `email` field —
HR must supply one when inviting, so there's nothing to auto-invite with at creation
time regardless of event wiring. Inviting is an explicit `POST /employees/:id/invite`
action, a new `employees:invite` permission (distinct from `employees:update` —
provisioning account access is a more sensitive action than an ordinary field edit,
matching this codebase's existing one-permission-per-distinct-action pattern, e.g.
`custody:approve` vs `custody:pay`).

**Accepting auto-logs the new user in** (`AcceptInvitationUseCase` returns the same
`SessionTokens` shape as login, and the controller sets the refresh cookie the same
way) — a bare "success, now go log in separately" would be a half-finished
implementation for no reason. `LoginUseCase`'s token-issuance logic was extracted into
a new shared `IssueSessionUseCase` (used by both `LoginUseCase` and
`AcceptInvitationUseCase`) rather than duplicated — this is the second real use of
that logic, so extracting it now isn't premature abstraction.

**Multiple invitation rows per employee are allowed** — no unique constraint beyond
the primary key, same shape as `PasswordResetToken`. This gives "resend" for free (a
new token, the old one simply still works until used or expired) at the cost of a
known, accepted edge case: **a stale second acceptance for an already-linked employee
still creates a real, working `User` account — it just doesn't end up as the one
`Employee.userId` points to.** `linkUser()`'s `WHERE ... AND user_id IS NULL` clause
is the atomic guard that stops it from *overwriting* the first link; the listener logs
a warning when this happens so HR can notice and clean up an orphaned account.
Preventing this outcome entirely would require `auth`'s `AcceptInvitationUseCase` to
read `Employee.userId` before creating the `User` — meaning `auth` would need to
import `employees`, creating a bidirectional module dependency (since `employees`
already imports `auth` the other way) to close a low-severity, low-likelihood gap
(no privilege escalation, no data leak — an extra unlinked login). Not worth it.

**`TenantDatabase.withoutTenant()`'s doc comment was already inaccurate before this
change** — `PasswordResetTokensRepository.findValidByHashAcrossCompanies` used it
since Phase 0, predating the two cases I wrote into that comment during Stage 2c. This
`Invitation` lookup is a third instance of the same shape (pre-session lookup by a
bearer credential). Fixed the comment to describe the pattern generally instead of
enumerating call sites that will keep going stale as more get added.

## Options considered
| Option | Why not |
|---|---|
| Route invite creation through `notifications` (matching the original doc sketch) | `Notification.recipientUserId` requires an existing `User`; an invitee has none |
| Create a `User` immediately at invite time, status `invited`, placeholder password hash | `User.passwordHash` isn't nullable; a fake-but-unguessable hash is extra complexity for no benefit over just not creating the row yet |
| `auth` reads `Employee.userId` at accept time to fully prevent the stale-second-token edge case | Requires a bidirectional `auth` ↔ `employees` dependency to close a low-severity gap |
| A unique constraint limiting one `Invitation` per employee | Blocks "resend" without an explicit delete/replace step |

## Consequences
- Easier: the accept flow is a real, complete feature (working login, not a dead end);
  the pattern (auth owns credential mechanics, calling module owns its own
  precondition, event bus for the reverse link) is now established for any future
  module that needs to provision a `User` (there are none planned yet).
- Harder: two places to look for "how does someone get a login" (`auth`'s own
  seed-adjacent path and this invitation path) — acceptable, they're genuinely
  different flows (bootstrap admin vs. ongoing employee onboarding).
- Revisit when: real email delivery exists (Phase 3) — swap the `Logger.log` for an
  actual send, no other change needed; or if the stale-second-token edge case turns
  out to matter in practice (unlikely, but the fix is well-understood if needed).
