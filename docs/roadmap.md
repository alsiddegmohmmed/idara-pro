# Roadmap

Tick tasks when done (`[x]`). Agents: work on the current phase only unless asked.

**Direction (owner, 2026-09-29):** one company, many branches (one live today, more connected later
without code changes); ~95% of users limited to their own branch, senior managers see all; hundreds of
users; full HR file per employee. The plan below was re-ordered after a review of Phases 0–3 —
access control and the employee file come **before** payroll, because payroll depends on them.
Phases 0–3 were built quickly; Phase 4 also pays back their shortcuts (unscoped employee data,
no pagination, name-based role grants).

## Phase 0 — Foundation  ← done
Done when: an admin can log in over HTTPS on the company server. Login itself
is fully verified, including against the built prod Docker image over real
HTTP; "HTTPS on the company server" needs an actual server + domain to
confirm, which doesn't exist yet (Caddy's automatic HTTPS is its own
documented behavior, not something special to this config).
- [x] Monorepo: pnpm workspaces, Turborepo, TypeScript base config, ESLint (+ boundaries plugin), Prettier
- [x] `packages/shared`: Zod setup, permission constants, shared enums
- [x] `apps/api`: NestJS + Fastify, config (Zod env), Pino logging, error filter, health endpoints
- [x] Prisma: schema for companies, branches, users, roles, permissions, refresh_tokens, audit_log; seed script
- [x] Auth: login, refresh, logout, password reset, `@RequirePermission` guard, request context (companyId)
- [x] Audit module (append-only) + event bus
- [x] `apps/web`: Vite + React + Tailwind + shadcn/ui, RTL layout, i18n (ar/en), login page, app shell
- [x] `infra/`: docker-compose.dev.yml (postgres, redis), docker-compose.prod.yml, Caddyfile — prod api image verified end to end (real Postgres, real login over HTTP); see `infra/README.md`
- [x] CI (GitHub Actions): lint, typecheck, test, build — `.github/workflows/ci.yml`, same sequence verified locally; unverified against a real GitHub Actions run (no remote pushed yet)
- [x] Decide: PostgreSQL RLS now or later (write ADR-0004) — deferred, see `docs/adr/0004-rls-deferred.md`

## Phase 1 — Employees  ✔ done
Done when: all staff are entered (by HR or by themselves after an invitation) and linked to user accounts.
The software for this is complete (below); actually entering and inviting the real staff is a go-live task (see the go-live checklist).
- [x] Departments, branches, schedules, holidays CRUD
- [x] Employees CRUD, dated salary components, documents + expiry reminders
  — expiry reminders (ADR-0006) ship a minimal Notification model + list/mark-read
    endpoints only; notification preferences and every other event type stay
    unbuilt until Phase 3's full Notifications module (Stage 4 added the
    review-decision notifications; email delivery is the `Mailer` queue, ADR-0008)
- [x] Invitations: invite → set password → `employees.user_id` linked
  — accept auto-logs the new user in; the emailed link is one-time, 72 hours (ADR-0007, ADR-0008)
- [x] Stage 4 (ADR-0008): email via Nodemailer + worker queue (Mailpit in dev), invitation and
  password-reset emails (Arabic + English), forgot-password rate limiting, employee self-service
  (`/me/*`: contact info, IBAN, documents), HR review queue (reason required, employee notified),
  IBAN validation + masking, upload checks (10 MB, PDF/JPG/PNG by magic bytes), default Employee
  role, Arabic RTL web UI (accept invitation, employees, review queue, my profile, notifications bell)
- [x] Stage 4.1 (ADR-0008): four-eyes review (no self-approval), deactivation cuts access (user disabled,
  sessions revoked, unused invitations cancelled), restoring access needs `employees:manage-access`
  and forces a new password by email, Redis password in prod, reviewer document download,
  `REDIS_URL` validated at startup

## Phase 2 — Attendance  ✔ software done (pilot pending)
Done when: one branch uses it for 2 weeks with no paper sheet.
- [x] Check-in/out with server-side radius + accuracy check, idempotency (ADR-0009)
- [x] Nightly absence + missing check-out job
- [x] Manager/HR corrections with reason; attendance reports + Excel export
- [x] Web: check-in screen, my attendance, HR/manager attendance board, corrections, export

## Phase 3 — Leave and custody  ✔ software done
Done when: requests no longer go through WhatsApp.
- [x] Leave types, balances, requests, approvals, calendar (API — ADR-0010)
- [x] Custody workflow: requested → approved → paid (Techno Link ref) → settled (API + Excel export)
- [x] Notifications (in-app + email): leave, custody, missing check-out
- [x] Web: leave (request, balances, approvals, calendar), custody (request, manage), notification texts

## Phase 4 — Access foundation  ← CURRENT  (ADR-0011, ADR-0012)
Done when: an HR user of branch A cannot see anything of branch B by any endpoint; an executive sees all
branches; a manager sees only their team; a role change takes effect on the next request; CI proves it.
- [x] Owner decisions (2026-09-30): default roles and templates (ADR-0011 §7), salaries HR + Accounting only,
      flexible roles (many roles per person, many people per responsibility, ADR-0011 §6), pending requests
      stay with the old branch on transfer (ADR-0012)
- [x] Approval routing by permission + reach: every eligible approver sees the item, first decision wins
      (replaced "manager, else HR" routing in leave and custody; custody payers and document-expiry
      reminders are routed the same way)
- [x] Migration: `role_assignments` + `assignment_branches`, system roles with fixed ids (no more grants by
      role *name*), permission catalog v2 with old→new code mapping, backfill of existing users
- [x] `shared/access`: `AccessPolicy` + `DataScope`; access snapshot in Redis; guard reads the snapshot;
      JWT stops carrying permissions; `GET /auth/access` returns reach + branches
- [x] Apply `DataScope` to every employee-owned read: employees, salary, documents, review queue,
      attendance, leave, custody, exports; sensitive tiers split (`employees:read-sensitive`, `salary:*`)
      — proven by `apps/api/test/access-control.e2e.test.ts` (branch manager / HR / executive / regional HR / team lead)
- [x] Branch snapshots on attendance/leave/custody + history of employee edits (`employee_assignments`).
      Records are scoped by their own branch. **No transfer workflow** (owner, 2026-09-30: branches are separate
      businesses); the transfer UI/API built earlier was removed. Custom roles made before 2026-09-30 got
      `salary:*` / `employees:read-sensitive` only if they held `employees:update`: re-check them in the access screens.
- [x] `access` module + screens: roles, permissions with reach, assign to users (home / selected branches,
      dates), access review report; guardrails (no escalation, no self-edit, last Super admin)
      — الصلاحيات page: People (assign/remove roles, home or selected branches, dates), Roles (create, copy,
      edit, retire; built-in roles read-only), Access review. Guardrails enforced by the API.
- [ ] Cursor pagination + server-side search/filters on employees, attendance, leave, custody lists
- [ ] Authorization matrix test (every route × default role × in/out of scope) + cross-branch isolation test in CI;
      run the integration suite in CI (GitHub Actions has Docker)
- [x] Audit viewer (السجل) and audit of reads of sensitive data
- [x] Company setup screens: branches (with map/GPS), departments, schedules, holidays, settings (API exists, UI does not)

## Phase 5 — Employee file
Done when: everything HR keeps on paper about an employee is in the system.
      — إعداد الشركة page: branches (GPS point from a Maps link or "use my location", radius, default schedule,
      Techno Link code), departments, work schedules, holidays, GPS accuracy policy with effective dates
      — السجل page (company-wide audit:read): filters, newest first with keyset paging, before/after changes;
      opening another person's profile (with personal data) or salary is logged as `view`
- [ ] Personal data (gender, birth date, marital status, additional number), several relatives / trusted contacts
- [ ] Contracts (type, start, end, probation, renewal) + insurance policies and enrolment
- [ ] Employee page tabs: personal, employment (career history), contracts, insurance, documents, warnings, salary
- [ ] Alerts engine v1: rules, thresholds, recipients by role and reach; contract / probation / insurance / document
- [ ] Excel import of employees (one-time onboarding of a branch) with a dry-run report
- [ ] Owner decisions: contract types, probation rules, dependants insured?

## Phase 6 — Discipline, short permissions and adjustments
Done when: warnings, الاستئذانات and deductions no longer live on paper or WhatsApp.
- [ ] Warnings: propose → issue → acknowledge → rescind; ladder as settings
- [ ] Short permissions (الاستئذانات): request, approve, excuse lateness/early leave in attendance, monthly allowance setting
- [ ] Leave rules: sick-leave pay tiers + certificate attachment, emergency limits, long-service entitlement
- [ ] Adjustments: propose / approve deductions, bonuses, allowances; link to warnings and attendance
- [ ] Owner decisions: warning ladder, permission allowance, sick/emergency rules, legal deduction cap

## Phase 7 — Payroll and export
Done when: one month's payroll matches the accountant's manual figure.
- [ ] Payroll settings (GOSI rates, deduction policies) with effective dates
- [ ] Payroll run: calculate (from salary components, attendance, unpaid leave, approved adjustments), review, adjust, approve, lock
- [ ] Payslip PDFs (employee sees only their own)
- [ ] Excel export for Techno Link
- [ ] Termination settlement (end-of-service award) — after HR/legal input

## Phase 8 — More branches
Done when: a second branch is live with its own HR and managers and no developer involved.
- [ ] Branch onboarding checklist (branch, schedule, holidays, roles, import, invitations)
- [ ] Cross-branch dashboards and reports for executives; per-branch reports for branch managers
- [ ] Load test with 500 employees / 10 branches / 1 year of data; tune indexes
- [ ] Access recertification report (quarterly "who can do what")

## v2 (later)
- Techno Link API sync (if an API exists) · native mobile app · more reports

## Go-live checklist
Must all be true before real employees use the system (v1 accepts some risks only *because* of these):
- [ ] **Encrypted, off-site backups** of the database and the `idara_files` volume, with a tested restore
  — required because IBANs are stored as plaintext columns (ADR-0008)
- [ ] Prod secrets set in `infra/.env`: `POSTGRES_*`, `IDARA_APP_PASSWORD`, `JWT_*`, `REDIS_PASSWORD`, `SMTP_*`, `DOMAIN`
- [ ] **Authorization matrix green in CI** and a manual cross-branch check by someone who is not the developer
- [ ] Encrypted IBANs (or a decision to accept plaintext) and PDPL review of what personal data is stored
- [ ] **All staff entered and invited** (HR adds them or sends invitations; everyone linked to a user)
- [ ] **Email outbox so emails survive a Redis outage** (ADR-0008) — today an email queued after a commit is lost if Redis is down for all retries
- [ ] Real SMTP sending verified with an invitation email to a real inbox (Mailpit is dev-only)
- [ ] HTTPS live on the real domain (Caddy) and the API port confirmed unreachable from outside Caddy
- [ ] Owner account created and initial roles/permissions checked on the prod database (`prisma migrate deploy` only — no dev seed)

## Open questions (owner: Siddeg)
- [ ] Techno Link: API or Excel import available?
- [ ] Accountant's Excel layout for payroll and custody export
- [ ] HR policies: weekend days, late/absence deductions, leave accrual, GOSI-eligible allowances
- [ ] Headcount, branches, field staff without a fixed branch?
- [x] Roles at a branch: central HR today, Branch HR later as a template; salaries: HR + Accounting (2026-09-30)
- [ ] Notify the closest approver first and escalate after N hours, or notify all at once? (default: all)
- [ ] Warning ladder, short-permission allowance, sick/emergency leave rules, legal cap on deductions
- [ ] Contract types and probation rules; are dependants insured?
- [x] Pending requests on transfer stay where filed (2026-09-30)
- [ ] Server specs; domain confirmed (yes) — subdomain to use?; off-site backup location
