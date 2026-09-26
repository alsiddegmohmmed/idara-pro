# ADR-0001: Modular monolith

**Status:** Accepted
**Date:** 2026-09-26
**Deciders:** Siddeg

## Context
One developer (with AI agents), one company, tens to a few hundred employees, self-hosted on
the company server. Payroll must read attendance, leave and custody consistently.
"Scalable" here means the codebase can grow and be split later, not many servers now.

## Decision
One NestJS application split into strict modules with 4 layers each (http, application,
domain, infrastructure). Modules communicate only via their public `index.ts` service or
in-process domain events. One PostgreSQL database. Background work in a BullMQ worker
process built from the same codebase.

## Options considered
| Option | Complexity | Ops on own server | Fit for 1 dev | Path to scale |
|---|---|---|---|---|
| **Modular monolith** | Low–medium | api + worker + Postgres + Redis | Good | Extract a module when needed |
| Microservices | High | Many services, gateway, broker | Poor | Already split |
| Plain layered monolith | Low at first | api + Postgres | Good | Hard: modules tangle |

## Consequences
- Easier: one deploy, real DB transactions, simple local dev, agents work module by module.
- Harder: boundaries are enforced by lint rules and review, not the network.
- Revisit when: a module needs independent scaling, or a second team joins.
