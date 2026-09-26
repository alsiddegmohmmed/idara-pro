# ADR-0002: Tech stack

**Status:** Accepted
**Date:** 2026-09-26
**Deciders:** Siddeg

## Decision
| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces + Turborepo |
| API | **NestJS on Fastify** |
| DB | PostgreSQL 16 |
| ORM / migrations | Prisma (raw SQL allowed for reports) |
| Validation | Zod schemas in `packages/shared` |
| Jobs | BullMQ + Redis |
| Auth | JWT access (15 min) + rotating refresh cookie, Argon2id |
| Files | Local disk behind a `FileStorage` interface (ADR-0005; was MinIO) |
| Email | SMTP via Nodemailer |
| Excel / PDF | ExcelJS; payslip PDF from HTML via Playwright/Chromium |
| Web | React + Vite, React Router, TanStack Query, React Hook Form, Tailwind + shadcn/ui, i18next |
| PWA | vite-plugin-pwa |
| Tests | Vitest, Supertest, Testcontainers, Playwright |
| Logs | Pino |
| Deploy | Docker Compose + Caddy on the company server |

## Why NestJS over plain Express/Fastify
Built-in modules, dependency injection and guards match ADR-0001 and give AI agents one
consistent pattern. Plain Express would require hand-building DI, module wiring and
permission guards. Cost: learning curve (~1–2 weeks) and more boilerplate.

## Why Prisma over Drizzle
Mature migration tooling and typed client. Drizzle is a valid alternative; the ORM is
isolated in `infrastructure/` so it can be swapped.

## Consequences
- One language and shared schemas between API and web.
- Prisma + RLS needs care (`SET LOCAL` inside interactive transactions) — decide in Phase 0.
