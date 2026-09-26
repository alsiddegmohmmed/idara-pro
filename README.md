# Idara Pro (إدارة برو)

HR and employee-operations platform: employees, GPS attendance, leave, custody requests,
payroll preparation and notifications. Arabic-first (RTL), works on phones as a PWA.

Accounting stays in **Techno Link**. Idara Pro hands over approved payroll and paid custody
as an Excel export (v1, manual). See `docs/adr/0003-techno-link-manual-handoff.md`.

## Stack

TypeScript monorepo (pnpm + Turborepo) · NestJS (Fastify) · PostgreSQL 16 + Prisma ·
BullMQ + Redis · MinIO · React + Vite + Tailwind + shadcn/ui · Docker Compose + Caddy.

## Status

Phase 0 (foundation) — monorepo tooling, `packages/shared`, the `apps/api` skeleton
(health endpoints, config, logging, error handling), the `apps/web` skeleton (RTL, i18n,
login page, app shell), and `infra/docker-compose.dev.yml` are scaffolded. Prisma
(needs an RLS decision — ADR-0004), auth, and CI are next. See `docs/roadmap.md`.

## Docs

| Doc | What it covers |
|---|---|
| `AGENTS.md` | Rules for AI agents and humans writing code here |
| `docs/product/spec.md` | What we build in v1 and what we don't |
| `docs/domain/business-rules.md` | Attendance, leave, custody, payroll rules |
| `docs/domain/glossary.md` | Arabic ↔ English terms |
| `docs/architecture/overview.md` | Layers, folder structure, conventions, security, deployment |
| `docs/architecture/data-model.md` | Tables and relations |
| `docs/adr/` | Architecture decisions |
| `docs/roadmap.md` | Phases, tasks, open questions |
| `docs/getting-started-claude-code.md` | How to work on this repo with Claude Code |
