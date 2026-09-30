# Product spec — Idara Pro v1

## Goal

One HR platform for the whole company — replacing paper, WhatsApp and Excel for everything about
employees — and one place where managers approve requests and see who is working.

The company has **several branches**; every employee belongs to one branch. Today one branch is
live; the others connect later **without code changes** (create the branch, give people branch-level
roles). Most users see only their own branch; a small group of senior managers sees all branches.
One company (one tenant); branches are a scope inside it (ADR-0011).

## Organization model

```
Company (tenant)
 ├── Branch  — GPS location + radius, default schedule
 │     └── Employee — one current branch (history kept, ADR-0012)
 └── Department (company-wide, may nest) — an employee also belongs to one department
```

- A **manager** is an employee (`manager_id`); "team" = direct and indirect reports.
- An employee's **login** is optional and linked when they accept an invitation.
- A **role assignment** says who can do what, and where (own / team / branch / company reach).

## Scope boundary with Techno Link

| Owned by Idara Pro | Owned by Techno Link (do NOT build) |
|---|---|
| Employees, contracts, insurance, documents | Chart of accounts, journal, cash boxes |
| Attendance (GPS), schedules, holidays, short permissions | Expenses, receipts, money transfers |
| Leave (annual, sick, emergency, unpaid) and balances | Sales, purchases, returns, customers, suppliers |
| Warnings, deductions and other pay adjustments | Items, inventory, branch stock |
| Custody requests and their status | VAT, e-invoicing, financial reports |
| Payroll calculation and payslips | |

Integration points (v1 = manual Excel export): **monthly payroll totals** and **custody payouts**.

## Users and roles

Access is **role-based with scope** (ADR-0011): a role is a set of permissions, each with a reach
(`own`, `team`, `branch`, `company`); an assignment gives a person a role for their home branch, a
list of branches, or the whole company. Roles and assignments are managed in the app.

| Default role | Reach | In short |
|---|---|---|
| Super admin | company | Everything, including managing roles |
| Executive (كبار المديرين) | company | Sees every branch, read-only, no salaries |
| HR admin | company | Runs HR for all branches, sees salaries |
| Accountant | company | Salaries, payroll, custody payment, exports |
| Manager | team or branch | Approves requests, sees attendance of their people |
| Employee | own | Own profile, check-in/out, own requests and payslips |
| Branch HR, Team lead | branch / team | **Templates** — ready for when the company needs them |

**Built to change:** roles are created and edited in the app; one person can hold several roles, and
one responsibility can be shared by several people — a request goes to everyone who can approve it
and the first to decide closes it. Approval never depends on one named person (ADR-0011 §6).

Sensitive data is separate: seeing a colleague in the list does **not** show their salary, ID,
contract, insurance or warnings — those have their own permissions. **Salaries: HR and Accounting
only** (plus each employee's own).

## Modules

| Module | Status | Summary |
|---|---|---|
| Auth & users | built | Login, invite by email, reset password, sessions |
| **Access management** | **next** | Roles, permissions with reach, assignments to branches, access review report |
| Company setup | API built, screens missing | Company profile, branches (GPS + radius), departments, schedules, weekends, holidays |
| Employees | built (core) | Profile, job, department, branch, manager, salary components, documents with expiry, IBAN review |
| **Employee file** | **planned** | Personal data (gender, birth date, marital status), several relatives / trusted contacts, extra phone, **contract** (type, start, end, renewals), **insurance**, career history and transfers |
| Attendance | built | GPS check-in/out (server enforces radius), late/absent by schedule, corrections |
| Leave | built (basics) | Annual, sick, emergency, unpaid; balances; approvals; calendar. Sick/emergency rules and certificates planned |
| **Short permissions (الاستئذانات)** | **planned** | Hours off: late arrival, early leave, mid-day exit; approval; feeds attendance |
| **Warnings (إنذارات)** | **planned** | Propose → issue → employee acknowledges; feeds deductions and alerts |
| Custody | built | Request → approve → paid (Techno Link ref) → settled. Status only |
| **Adjustments & deductions** | **planned** | Manual and rule-based deductions, bonuses, allowances with reason and approval; feed payroll |
| Payroll | planned | Monthly run, GOSI, deductions, payslips, lock after approval |
| Techno Link export | custody built, payroll planned | Excel of approved payroll and paid custody |
| **Alerts** | **planned** | Rules: contract / document / insurance expiring, probation ending, warnings piling up, low balance, missing check-out |
| Notifications | built | In-app + email for approvals and alerts |
| Dashboard | built (v1) | Per role: today's attendance, what needs action, expiring items |
| Audit log | built (writes) | Who changed what; **viewer planned**; views of sensitive data are logged |
| Expenses, income, vendors, invoices | **Removed** | Done in Techno Link |

## Out of scope for v1

Accounting of any kind · Techno Link API sync (v2, if an API exists) · native mobile app ·
recruitment · performance reviews · training · shift rotas / night shifts · multi-company signup/billing.
(If a second *legal entity* ever joins, a group layer above Company is added — ADR-0011 "Revisit".)

## Non-functional targets

- Hundreds of users and several branches on one server, pages fast: server-side filtering and
  cursor pagination on every list; branch filters use indexed columns.
- Permission changes take effect on the user's next request; revoked users lose access at once.
- Arabic first (RTL), English second; Western digits; Asia/Riyadh time.
- Personal data (PDPL) stays on the company server in KSA; access to sensitive data is logged.
- Backups off-server with a tested restore before real employees go live.

## Origin

A Base44 demo (`divergent-pro-biz-flow.base44.app`) was used to explore the idea. It is
**reference only**: v1 is a clean rebuild. Known demo problems fixed by design: UI-only
permissions, GPS radius not enforced, broken employee↔user link, manual vendor balances,
payroll excluded from finance, no weekends/holidays.
