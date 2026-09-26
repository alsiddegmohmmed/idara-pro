---
description: Scaffold a new API module with the 4-layer structure
argument-hint: <module-name>
---

Scaffold the API module `$ARGUMENTS` in `apps/api/src/modules/$ARGUMENTS/` following AGENTS.md:

```
$ARGUMENTS/
  http/            $ARGUMENTS.controller.ts, dto/
  application/     use-cases/, ports/ (repository interfaces)
  domain/          entities, pure rules + *.spec.ts
  infrastructure/  prisma-$ARGUMENTS.repository.ts
  $ARGUMENTS.module.ts
  index.ts         exports ONLY the public service/types
```

Rules:
- Register the module in the app module.
- Controller endpoints use `@RequirePermission(...)` and Zod DTOs from `packages/shared`.
- Repositories always take `companyId` from the request context.
- Add the module to the ESLint boundaries config.
- Add a minimal passing unit test and integration test.
- Do not add business features beyond the skeleton unless asked.

Finish by running `pnpm lint && pnpm typecheck && pnpm test` and report the result.
