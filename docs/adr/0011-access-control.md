# ADR-0011: Access control — roles, branch-scoped assignments, data scope, sensitive fields

**Status:** Accepted
**Date:** 2026-09-29
**Deciders:** Siddeg

## Context
One company holds several branches; every employee belongs to one branch. About 95% of users must
only ever see their own branch; a small group of senior managers ("executives") sees all branches.
Hundreds of users, many roles, more branches to be connected later.

A review of the code after Phase 3 found the current access model is not enough for that:

1. Scopes (`own`/`team`/`branch`/`company`) are stored on `role_permissions` but only enforced by
   attendance, leave and custody. `employees:read` returns every employee in the company, and the
   salary endpoint needs only `employees:read`, so listing a team would also expose salaries.
2. There is no role management: roles get permissions only through migrations that match role
   *names* ("HR", "Manager", "Accountant") — fragile and not editable by the company.
3. A user's branch reach is hard-wired to their own employee record, so "one regional manager over
   three branches" cannot be expressed.
4. "Team" means direct reports only.
5. The access token carries permission codes for up to 15 minutes, so a revoked permission keeps
   working, and the token grows with every permission added.
6. Lists load everything and filter in memory (no pagination except notifications).

## Decision

### 1. The model: RBAC with scoped role assignments
- **Permission** = `resource:action` from one global catalog (below).
- **Role** = a named set of permissions. Each permission in a role has a **reach**:
  `own` · `team` · `branch` · `company`.
- **Assignment** = a user holds a role, with **where** it applies: for `branch` reach either
  `home` (the branch on the user's employee record — follows transfers automatically, no admin
  work) or `selected` (an explicit list of branches, e.g. a regional manager). Optional
  `valid_from`/`valid_to` for temporary delegation (acting manager).
- A user can hold several assignments; the effective reach for a permission is the **union**.

| Reach | Means |
|---|---|
| `own` | only the user's own records |
| `team` | the user's direct **and indirect** reports (manager chain, depth capped at 6) |
| `branch` | every employee of the assignment's branches (`home` or `selected`) |
| `company` | every branch (this is what an executive gets) |

Why this shape: the 95% case ("my own branch") needs no per-user setup — give the person a
branch-reach role with `home`. The 5% case (executives, regional managers) is one assignment.

### 2. One place enforces data scope
- `AccessPolicy.scopeFor(user, permission)` returns a **DataScope**
  (`all | { branchIds, teamOf, self }`), read from the cached access snapshot.
- Every repository method that reads employee-owned data **takes a DataScope** and turns it into a
  SQL filter (`branch_id = ANY(...) OR employee_id = ANY(team) OR employee_id = self`). Single
  records use `AccessPolicy.assertCanAccess(scope, record)`.
- Modules never write their own scope checks (AGENTS.md rule 11). Forgetting to pass a scope must
  fail at compile time, not in production.

### 3. Sensitive data has its own permissions, enforced on the server
| Tier | Fields | Permission |
|---|---|---|
| Directory | name, employee no., job title, branch, department, status, work phone | `employees:read` |
| Personal | national ID / iqama, date of birth, personal phone & email, address, contacts, IBAN | `employees:read-sensitive` |
| Compensation | salary components, payslips, adjustments | `salary:read`, `salary:manage` |
| Contracts | contract type, dates, terms | `contracts:read`, `contracts:manage` |
| Insurance | policy, member number, class | `insurance:read`, `insurance:manage` |
| Discipline | warnings | `warnings:read`, `warnings:propose`, `warnings:issue` |

Fields the caller may not see are **omitted or masked by the API** (never by the UI alone).
An employee always sees their own record. Reading another person's Personal or Compensation
data is written to the audit log (`view`), for PDPL accountability.

### 4. Access snapshot, not permissions in the token
- The access token carries user id and company id only.
- The guard loads the user's **access snapshot** (permissions × reach × branches) from a Redis
  cache (TTL 5 min as a backstop) and falls back to the database if Redis is down.
- Any change to roles, assignments, branch, employee status or user status **deletes that user's
  cached snapshot immediately**, so a revocation takes effect on the next request.
- `GET /auth/access` returns the snapshot to the web app for showing/hiding UI.

### 5. Role management (screens + API), with guardrails
- `access:read` / `access:manage` hold the screens: roles, permissions per role (with reach),
  assigning roles to users (with branches and dates), and an **access review report**
  (who can do what, where).
- **System roles** (seeded, fixed ids, updated by releases) cannot be edited; a company copies one
  to customise it. Custom roles are editable.
- **No privilege escalation:** you can only grant a permission at a reach you hold yourself.
- Nobody edits their own assignments; the last Super admin cannot be removed or demoted.
- Every change is audited with before/after.
- Grants by role *name* in migrations stop; system roles are created with fixed ids.

### 6. Default roles (proposed — the owner confirms the exact permission lists)
| Role | Reach | Typical permissions |
|---|---|---|
| Super admin | company | everything, incl. `access:manage` |
| Executive (كبار المديرين) | company | read-only: employees, attendance, leave, custody, warnings, reports; salary only if granted |
| HR admin (central) | company | employees CRUD + sensitive, contracts, insurance, warnings issue, leave approve/manage, attendance correct, short leave approve, adjustments propose |
| Branch HR | branch | same as HR admin, limited to its branches |
| Branch manager | branch | directory, attendance read/correct, leave/short-leave/custody approve, warnings propose |
| Team lead | team | attendance read/correct, leave/short-leave approve, warnings propose |
| Accountant | company | salary read, payroll, custody pay/settle, adjustments read, exports |
| Employee | own | self-service, punch, request leave/short leave/custody |

### 7. Permission catalog (target)
`access:read|manage` · `org:read|manage` (branches, departments, schedules, holidays; replaces
`company:*`) · `settings:manage` · `employees:read|read-sensitive|create|update|delete|invite|manage-access|review|self-service|transfer`
· `contracts:read|manage` · `insurance:read|manage` · `salary:read|manage` · `documents:read|manage`
· `attendance:punch|read|correct` · `leave:request|read|approve|manage` · `shortleave:request|read|approve`
· `warnings:read|propose|issue|rescind` · `adjustments:read|propose|approve` · `custody:request|read|approve|pay|settle`
· `payroll:read|run|approve` · `exports:create` · `alerts:manage` · `notifications:read` · `audit:read`.
The code format stays `resource:action` (`^[a-z]+:[a-z-]+$`). Old codes map to new ones in a
forward-only migration (`company:*` → `org:*`, salary reads move from `employees:read` to `salary:read`).

### 8. Proof, not trust: the authorization matrix
- A generated test lists **every route** with its required permission and runs it as each default
  role against an in-scope and an out-of-scope record, against a real Postgres. Expected
  allow/deny lives in one table.
- CI fails if a route has no `@RequirePermission` or no matrix row.
- The cross-tenant test from ADR-0004 stays and gains a cross-branch twin.

## Options considered
| Option | Complexity | Fit |
|---|---|---|
| RBAC + scoped assignments (chosen) | Medium | Matches "own branch by default, some see all"; standard, auditable |
| Permissions and branch list in the JWT | Low | Rejected: stale for 15 min, token grows, no instant revoke |
| ABAC / policy engine (OPA, Cedar) | High | Rejected: far more than needed for hundreds of users |
| Per-record ACLs | High | Rejected: unmanageable at HR scale |
| Postgres RLS for branch scope | High | Rejected for now: scope depends on team chain and multiple assignments; company-level RLS stays a go-live decision (ADR-0004) |

## Consequences
- Easier: adding a branch = create it, assign branch-reach roles; nobody edits code or migrations.
- Harder: every employee-owned repository needs a DataScope parameter; the migration touching
  `user_roles`, permission codes and existing grants must be done carefully and tested.
- Revisit when: thousands of users (per-request snapshot cost), a second legal entity joins
  (group layer above Company), or auditors ask for periodic access recertification workflow.
