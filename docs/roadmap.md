# Roadmap

Tick tasks when done (`[x]`). Agents: work on the current phase only unless asked.

## Phase 0 — Foundation  ← CURRENT
Done when: an admin can log in over HTTPS on the company server.
- [ ] Monorepo: pnpm workspaces, Turborepo, TypeScript base config, ESLint (+ boundaries plugin), Prettier
- [x] `packages/shared`: Zod setup, permission constants, shared enums
- [x] `apps/api`: NestJS + Fastify, config (Zod env), Pino logging, error filter, health endpoints
- [ ] Prisma: schema for companies, branches, users, roles, permissions, refresh_tokens, audit_log; seed script
- [ ] Auth: login, refresh, logout, password reset, `@RequirePermission` guard, request context (companyId)
- [ ] Audit module (append-only) + event bus
- [ ] `apps/web`: Vite + React + Tailwind + shadcn/ui, RTL layout, i18n (ar/en), login page, app shell
- [ ] `infra/`: docker-compose.dev.yml (postgres, redis, minio), docker-compose.prod.yml, Caddyfile
- [ ] CI (GitHub Actions): lint, typecheck, test, build
- [ ] Decide: PostgreSQL RLS now or later (write ADR-0004)

## Phase 1 — Employees
Done when: all staff imported and linked to user accounts.
- [ ] Departments, branches, schedules, holidays CRUD
- [ ] Employees CRUD, dated salary components, documents + expiry reminders
- [ ] Invitations: invite → set password → `employees.user_id` linked
- [ ] Excel import of existing employees

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

## Open questions (owner: Siddeg)
- [ ] Techno Link: API or Excel import available?
- [ ] Accountant's Excel layout for payroll and custody export
- [ ] HR policies: weekend days, late/absence deductions, leave accrual, GOSI-eligible allowances
- [ ] Headcount, branches, field staff without a fixed branch?
- [ ] Server specs; domain confirmed (yes) — subdomain to use?; off-site backup location
