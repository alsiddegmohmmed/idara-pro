# Roadmap

Tick tasks when done (`[x]`). Agents: work on the current phase only unless asked.

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

## Phase 1 — Employees  ← CURRENT
Done when: all staff are entered (by HR or by themselves after an invitation) and linked to user accounts.
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

## Phase 2 — Attendance
Done when: one branch uses it for 2 weeks with no paper sheet.
- [ ] Check-in/out with server-side radius + accuracy check, idempotency
- [ ] Nightly absence + missing check-out job
- [ ] Manager/HR corrections with reason; attendance reports + Excel export

## Phase 3 — Leave and custody
Done when: requests no longer go through WhatsApp.
- [ ] Leave types, balances, requests, approvals, calendar
- [ ] Custody workflow: requested → approved → paid (Techno Link ref) → settled
- [ ] Notifications (in-app + email)

## Phase 4 — Payroll and export
Done when: one month's payroll matches the accountant's manual figure.
- [ ] Payroll settings (GOSI rates, deduction policies) with effective dates
- [ ] Payroll run: calculate, review, adjust, approve, lock
- [ ] Payslip PDFs
- [ ] Excel export for Techno Link

## v2 (later)
- Techno Link API sync (if an API exists) · native mobile app · more reports

## Go-live checklist
Must all be true before real employees use the system (v1 accepts some risks only *because* of these):
- [ ] **Encrypted, off-site backups** of the database and the `idara_files` volume, with a tested restore
  — required because IBANs are stored as plaintext columns (ADR-0008)
- [ ] Prod secrets set in `infra/.env`: `POSTGRES_*`, `IDARA_APP_PASSWORD`, `JWT_*`, `REDIS_PASSWORD`, `SMTP_*`, `DOMAIN`
- [ ] Real SMTP sending verified with an invitation email to a real inbox (Mailpit is dev-only)
- [ ] HTTPS live on the real domain (Caddy) and the API port confirmed unreachable from outside Caddy
- [ ] Owner account created and initial roles/permissions checked on the prod database (`prisma migrate deploy` only — no dev seed)

## Open questions (owner: Siddeg)
- [ ] Techno Link: API or Excel import available?
- [ ] Accountant's Excel layout for payroll and custody export
- [ ] HR policies: weekend days, late/absence deductions, leave accrual, GOSI-eligible allowances
- [ ] Headcount, branches, field staff without a fixed branch?
- [ ] Server specs; domain confirmed (yes) — subdomain to use?; off-site backup location
