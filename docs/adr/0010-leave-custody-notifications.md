# ADR-0010: Leave, custody and approval notifications

**Status:** Accepted
**Date:** 2026-09-28
**Deciders:** Siddeg

## Context
Phase 3 moves leave and custody requests off WhatsApp. Several leave rules are TBD in
business-rules.md (accrual, carry-over, 30 days after 5 years, sick/emergency limits, who approves).
The owner accepted safe defaults that HR can change later.

## Decision
1. **Leave types** are seeded per company: annual (paid, deducts balance, 21 days), sick, emergency
   (paid, no balance, no yearly limit), unpaid (no balance). Stored in `leave_types`, editable later.
2. **Balance:** granted **in full on January 1st**, **no carry-over**, one `leave_balances` row per
   employee/type/year created on first use. HR (leave:approve at company scope) can set an individual
   entitlement with a reason (e.g. 30 days after 5 years) — audited.
3. **Requested days** = working days in the range (company weekend, holidays and the employee's
   schedule excluded). A request stays within **one calendar year**. No overlap with a pending or
   approved request. Balance check holds pending days: `available = entitled − used − pending`.
4. **Approval:** the employee's **manager (team scope) or HR (company scope)**; nobody decides their
   own request; a rejection needs a reason. Approval runs in ONE transaction: balance `used += days`,
   request approved, and `leave.approved` → attendance marks those working days `leave`
   (never overwriting a corrected day). The employee can cancel a request while it is pending.
5. **Custody** (status only, no ledger): requested → approved | rejected | cancelled, approved → paid
   (Techno Link reference required) → settled (settled amount ≤ paid). Each step has its own
   permission and scope (approve: manager/HR; pay: accountant; settle: HR/accountant); nobody acts on
   their own request; every step is audited. Paid custody exports to Excel for Techno Link; the
   column layout lives in one mapper file (`custody-export.ts`) until the accountant confirms it.
6. **Notifications:** producers emit one generic `notify.users` event (who + type + params + link);
   the notifications module writes the in-app row and enqueues a bilingual email (worker sends).
   Recipients: new requests → the employee's manager if they have an account, else company-scope
   approvers; decisions → the employee; approved custody → company-scope payers; missing check-out
   (nightly job) → the employee and their manager.
7. Roles (superseded by ADR-0011 system roles): the migration grants Employee `leave:request` + `custody:request` (own); Owner everything;
   roles named HR / Manager / Accountant get the matching permissions (company / team / company).

## Consequences
- Easier: payroll (Phase 4) reads approved unpaid leave days and settled custody directly.
- Harder: no half days; leave spanning New Year must be two requests.
- Revisit when: HR decides accrual/carry-over/long-service rules; half days are needed; per-user
  notification preferences are wanted; the accountant confirms the export layout.
