# ADR-0009: Attendance — punches, nightly close, corrections, scopes

**Status:** Accepted
**Date:** 2026-09-28
**Deciders:** Siddeg

## Context
Phase 2 replaces the paper attendance sheet. The demo this project replaces trusted the phone to
decide whether someone was at the branch. Several rules are still TBD (GPS accuracy limit, field
staff, night shifts), and managers must only see and fix their own team — but role scopes were stored
in `role_permissions.scope` and never enforced.

## Decision
1. **Server decides every punch.** `POST /attendance/punches` takes lat/lng/accuracy; the server
   computes the haversine distance to the employee's branch and accepts only if
   `accuracy <= attendance.max_gps_accuracy_m` (company setting, default 100 m) **and**
   `distance <= branch.radius_m`. Accuracy is checked first. **Check-out is checked too**, not only
   check-in (owner decision), so nobody clocks out from home. Rejected attempts are stored with
   `accepted = false` and a reason, never linked to a day, and the caller gets a 422 with details.
2. **In/out alternate** within a work day (in → out → in …). Worked minutes = sum of in→out pairs.
3. **Idempotency** via a generic `idempotency_keys` table (user + scope + key → stored response,
   24 h). The first success is saved in the same transaction as the punch; a retry replays it; the
   same key with a different body is refused. Reused later for payroll-run creation.
4. **Nightly close job** (worker, BullMQ scheduler, `ATTENDANCE_CLOSE_CRON`, default 00:15
   Asia/Riyadh) closes *yesterday* for every employed employee: no punch on a working day →
   `absent`; check-in without check-out → `missing_checkout`; weekend/holiday recorded as such.
   Idempotent. Never overwrites a `corrected` day or a `leave` day (the leave module will set those).
5. **Corrections** set check-in/out and/or status with a mandatory reason, stored in
   `attendance_corrections` (old → new) and the audit log. The day is marked `corrected`, so later
   punches and the nightly job keep the corrected figures. Nobody corrects their own day.
6. **Role scopes are enforced for attendance.** The access token still carries only permission
   codes; `UsersRepository.findPermissionScope()` returns the widest scope the user holds for a code.
   company = everyone, branch = my branch, team = employees whose `manager_id` is me, own = me.
   The migration grants `attendance:read/correct` at company scope to Owner and a role named "HR",
   at team scope to a role named "Manager"; `attendance:punch` (own) to Owner and Employee.
7. **Owner decisions for TBD rules (v1):** weekend Friday + Saturday (company setting, already the
   default); field staff **without a branch cannot punch** (clear error) until a policy exists;
   **no night shifts** — a schedule must start and end on the same day (already validated).
8. **Schedule priority:** employee schedule → branch default schedule → none (no lateness computed).
   A company-wide default schedule is not modelled yet.

## Options considered
| Option | Complexity | Cost | Scalability | Fit for team |
|---|---|---|---|---|
| Server-side judgement (chosen) | Medium | Low | Good | Fixes the demo's core flaw |
| Trust the phone's "inside" flag | Low | Low | Good | Rejected: trivially spoofed |
| Put scopes in the JWT | Medium | Low | Good | Rejected for now: token change + re-login for every role edit |

## Consequences
- Easier: reports and payroll (Phase 4) read one closed row per employee per day.
- Harder: GPS spoofing apps can still fake a location; accepted risk for v1 (the accuracy limit and
  stored raw coordinates make it auditable).
- Revisit when: field staff policy is decided; night shifts are needed; a company default schedule
  is wanted; scope checks are needed by more modules (then consider scopes in the token).
