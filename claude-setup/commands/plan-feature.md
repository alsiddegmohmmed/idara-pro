---
description: Plan a feature against the spec, business rules and architecture before coding
argument-hint: <feature description>
---

Plan this feature: $ARGUMENTS

Before planning, read:
- AGENTS.md
- docs/product/spec.md and docs/domain/business-rules.md
- docs/architecture/overview.md and docs/architecture/data-model.md
- the existing code of the module(s) involved

Then produce a plan with these sections and STOP (do not edit files):
1. **Goal** — one sentence, and which roadmap task it closes.
2. **Scope check** — confirm it is not an accounting feature owned by Techno Link.
3. **Business rules used** — cite them; list any that are TBD and how you will make them configurable.
4. **Data changes** — tables/columns/indexes/constraints + migration name.
5. **API** — endpoints, permissions (`resource:action` + scope), request/response shapes.
6. **Files** — create/modify list, grouped by layer (http, application, domain, infrastructure, web, shared).
7. **Events and jobs** — published/consumed events, background jobs.
8. **Tests** — unit tests for rules (with concrete numbers) and integration tests.
9. **Risks / questions** for the owner.
