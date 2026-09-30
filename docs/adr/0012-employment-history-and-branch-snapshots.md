# ADR-0012: Employment history, transfers, and branch snapshots on records

**Status:** Accepted — amended 2026-09-30 (no transfers, see point 7)
**Date:** 2026-09-29
**Deciders:** Siddeg

## Context
An `employees` row holds one *current* branch, department, manager, schedule and job title.
When an employee transfers between branches, changing that row silently rewrites the history of
every attendance day, leave request and custody request — branch reports and branch-scoped access
(ADR-0011) would be wrong for the past. Branch filtering through joins is also slow at scale.

## Decision
1. **`employee_assignments`** — effective-dated rows: `employee_id, branch_id, department_id,
   job_title, manager_id, schedule_id, valid_from, valid_to (null = current), reason, created_by`.
   Exactly one current row per employee (partial unique index). `employees.branch_id` etc. stay as
   the denormalised *current* values, updated in the same transaction, so existing reads keep working.
2. **A transfer** (or promotion / manager change) is a new assignment row with an effective date.
   A future-dated change is applied by a nightly job on its date. Requires `employees:transfer`,
   is audited, and notifies the employee and both branches' managers.
3. **Records that belong to a moment in time carry a `branch_id` snapshot** taken at creation:
   `attendance_days`, `leave_requests`, `custody_requests`, `warnings`, `shortleave_requests`,
   `payroll_items`, `payroll_adjustments`. Branch reports and branch-scope SQL filters use this
   indexed column — no joins, and history survives transfers.
4. Employee numbers stay unique per **company**, not per branch, so a transfer never renumbers.
5. **Pending requests at transfer time (decided 2026-09-30):** they stay with the branch they were
   filed in until decided — approvers of the old branch still see and decide them. New requests go to
   the new branch from the effective date.
6. `team` reach follows the *current* manager chain (recursive, depth capped at 6).
7. **Amendment (owner, 2026-09-30):** branches are separate businesses under the company, not outlets;
   employees are not transferred between them. Points 2 and 5 (transfer workflow, future-dated changes,
   notifications) are dropped and the transfer endpoint/job/UI were removed. What stays: branch snapshots on
   time-bound records (a corrected branch never moves history) and `employee_assignments` recording edits
   of branch/department/job title/manager/schedule, effective the day of the edit.

## Consequences
- Easier: correct branch reports across transfers; fast branch filters; audit trail of careers.
- Harder: one more table to keep in sync; backfill migration needed for existing rows
  (`valid_from = hire_date`, snapshot `branch_id` from the employee's current branch).
- Revisit when: departments need their own hierarchy-based scope, or job grades/salary bands are added.
