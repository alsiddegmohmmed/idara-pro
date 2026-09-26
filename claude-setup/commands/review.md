---
description: Review current changes against AGENTS.md rules
---

Review the current uncommitted changes (`git diff` and `git diff --staged`) against AGENTS.md.

Check, and report findings ranked by severity with file:line:
1. Tenant scoping — any query without `companyId` from request context.
2. Authorization — endpoints missing `@RequirePermission` or scope checks on the record.
3. Layer / module boundaries — forbidden imports (domain importing Nest/Prisma, cross-module internals).
4. Money as floats, time-zone bugs (server local time, missing Asia/Riyadh handling).
5. Missing validation, missing audit entries on sensitive changes.
6. Business rules invented instead of taken from docs (TBD rules must be settings).
7. Missing or weak tests (rules without concrete-number tests, bug fix without failing test).
8. Docs not updated (spec, business rules, data model, ADR).
9. Accounting features that belong in Techno Link.

End with: verdict (ready / needs changes) and the exact commands you ran.
