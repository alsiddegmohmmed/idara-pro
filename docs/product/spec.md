# Product spec — Idara Pro v1

## Goal

Replace paper, WhatsApp and Excel for everything about employees, and give managers one
place to approve requests and see who is working. One company today; multi-tenant ready.

## Scope boundary with Techno Link

| Owned by Idara Pro | Owned by Techno Link (do NOT build) |
|---|---|
| Employees, contracts, documents | Chart of accounts, journal, cash boxes |
| Attendance (GPS), schedules, holidays | Expenses, receipts, money transfers |
| Leave requests and balances | Sales, purchases, returns, customers, suppliers |
| Custody requests and their status | Items, inventory, branch stock |
| Payroll calculation and payslips | VAT, e-invoicing, financial reports |

Integration points (v1 = manual Excel export): **monthly payroll totals** and **custody payouts**.

## Users and roles

| Role | Can do |
|---|---|
| Owner / Admin | Everything, incl. company settings, roles, payroll approval |
| HR | Employees, documents, leave, attendance corrections; prepares payroll |
| Accountant | Views approved payroll, exports to Techno Link, marks custody as paid |
| Manager | Sees and approves requests of **their own team** only; team attendance |
| Employee | Own profile, check-in/out, own requests, own payslips |

Permissions are `resource:action` with a scope (`own`, `team`, `branch`, `company`),
stored in the DB and enforced on the server.

## Modules in v1

| Module | Decision | Summary |
|---|---|---|
| Auth & users | Rebuild | Login (national ID/Iqama or email + password), invite by email, reset password |
| Company settings | Trim | Company profile, branches with GPS + radius, schedules, weekends, holidays |
| Employees | Keep | Profile, job, department, branch, manager, dated salary components, documents with expiry |
| Attendance | Fix | Check-in/out with GPS; **server rejects punches outside radius**; late/absent by schedule; corrections with reason |
| Leave | Keep | Request → manager approves → balance updated; annual, sick, emergency, unpaid |
| Custody | Reshape | Request → approve → paid (Techno Link ref) → settled. Status only, no ledger |
| Payroll | Add | Monthly run, deductions, GOSI, payslips, lock after approval |
| Techno Link export | Add | Excel of approved payroll and paid custody |
| Notifications | Keep | In-app + email for approvals, document expiry, missing check-out |
| Dashboard | Trim | Headcount, present/late/absent today, pending requests, expiring documents |
| Audit log | Add | Who changed what and when |
| Expenses, income, vendors, invoices | **Removed** | Done in Techno Link |

## Out of scope for v1

Accounting of any kind · Techno Link API sync (v2, if an API exists) · native mobile app ·
recruitment · performance reviews · multi-company signup/billing.

## Origin

A Base44 demo (`divergent-pro-biz-flow.base44.app`) was used to explore the idea. It is
**reference only**: v1 is a clean rebuild. Known demo problems fixed by design: UI-only
permissions, GPS radius not enforced, broken employee↔user link, manual vendor balances,
payroll excluded from finance, no weekends/holidays.
