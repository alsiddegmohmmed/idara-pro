# Business rules

Rules marked **TBD** are not decided by the company yet. Agents must NOT invent them:
implement them as configurable settings with a safe default and flag them to the owner.

## Time and calendar

- Company time zone: `Asia/Riyadh`. A "work day" is a calendar date in that zone.
- Weekend days: configurable per company (default **Friday, Saturday** — TBD confirm).
- Public holidays: entered by HR per year in `holidays`.
- A working day = not weekend, not holiday.

## Attendance

- An employee has one `attendance_day` per work day and many raw `attendance_punches`.
- **Check-in accepted only if**:
  - distance (haversine) between phone location and the employee's branch ≤ `branch.radius_m`, and
  - GPS accuracy ≤ `settings.max_gps_accuracy_m` (default 100 m, TBD).
  Rejected punches return a clear error and are NOT stored as valid punches.
- Schedule priority: employee's schedule → branch default schedule → company default.
- `late_minutes = max(0, first_check_in − (schedule.start + late_grace_min))`.
- Status of a day: `present`, `late`, `absent`, `leave`, `holiday`, `weekend`.
- Nightly job (after the day ends in Asia/Riyadh): working days with no punch and no approved
  leave → `absent`. Days with check-in but no check-out → flagged `missing_checkout` for the manager.
- Corrections: only HR/manager (team scope), with a mandatory reason; audited.
- Remote/field staff without a fixed branch: **TBD**.

## Leave

- Types (seeded, configurable): annual, sick, emergency, unpaid.
- Requested days = working days between start and end (inclusive), excluding weekends/holidays.
- Annual balance default 21 days/year (TBD: accrual monthly vs yearly, carry-over, 30 days after 5 years).
- Approval by the employee's manager (or HR). On approval, in ONE transaction:
  update balance, set attendance days in range to `leave`, publish `leave.approved`.
- Cannot overlap an existing approved/pending request. Cannot exceed balance for types that deduct balance.

## Custody (عهدة)

- States: `requested → approved | rejected`, `approved → paid`, `paid → settled`.
- `paid` is set by the accountant after paying and recording it in Techno Link;
  requires `techno_link_ref` (free text in v1).
- `settled` when returned or justified; `settled_amount` may be less than the paid amount.
- Deducting unsettled custody from salary: only by explicit HR action in a payroll run (TBD policy).

## Payroll

- One run per period (`YYYY-MM`). States: `draft → calculated → approved → exported`.
- Calculation per employee uses salary components **effective in that period**
  (pro-rated for joiners/leavers — TBD method: calendar days vs 30-day month).
- Net = basic + allowances − deductions − GOSI (employee share) + adjustments.
- Deductions (all TBD policy, implement as settings):
  - absence: per absent day = daily rate (TBD: basic only, or basic + housing)
  - lateness: TBD (none / per minute / after N late days)
  - unpaid leave: per day = daily rate
  - custody recovery: only if HR adds it to the run
- **GOSI:** rates differ for Saudi vs non-Saudi and change over time. Store rates in settings
  with effective dates. Confirm current rates with GOSI before go-live. Never hard-code.
- Every payroll item stores a JSON breakdown of each line so any number can be explained.
- After approval the run is locked. Corrections = adjustment run for the same period.

## Techno Link export (v1)

- Available for runs in state `approved`. Produces an Excel file:
  - Sheet "Summary": totals per expense category (salaries, housing, transport, other allowances, GOSI employer).
  - Sheet "Employees": one row per employee with each component.
  - Custody export: paid custody in a date range.
- Exact column layout: **TBD** (ask the accountant). Keep the layout in one mapper file so it is easy to change.
- Export is saved (`exports` table + file in file storage, ADR-0005) and the run becomes `exported`.

## Documents

- Types: Iqama, passport, national ID, contract, other. Expiry reminders at 60, 30, 7 days (TBD).

## Employee onboarding

- No public sign-up. The only way to get an account is HR inviting a specific employee
  record by email. The invitation link is one-time use and expires after **72 hours**;
  HR can re-send it (a new link/token), which does not invalidate a still-valid earlier
  one.
- HR-owned fields (set and edited only by HR): name (ar/en), national ID/Iqama number,
  nationality, job title, department, branch, schedule, manager, hire/end date, status,
  and salary components. The employee can **view** these on their own profile but
  cannot edit them.
- Employee self-service fields (the employee edits these freely, no review): phone,
  personal email, address, emergency contact name and phone.
- IBAN and uploaded documents are different: an employee's submission does not take
  effect immediately. It is recorded as `pending_review`; the previously **approved**
  IBAN (if any) stays the one actually used (e.g. for payroll) until HR approves the
  new one. HR approves or rejects from a review queue; a rejection requires a reason,
  which the employee sees on their own profile. The employee is notified (in-app) on
  both approval and rejection.
- IBAN is sensitive: shown in full only to the employee themselves and to HR users with
  the review permission. Everywhere else it is masked to just the last 4 characters
  (e.g. `SA•• •••• ••••1234`).
- Every self-service change, and every HR approve/reject decision, is audited.
- Four eyes: nobody approves or rejects their own IBAN or document submission, and nobody
  sets their own IBAN or uploads their own documents through the HR screens — an HR user who
  is also an employee needs a second reviewer.
- Leaving and returning: setting an employee to inactive (or deleting them) cancels any unused
  invitation, disables their login and ends all their sessions. Setting them back to active
  does not by itself restore the login: that takes the separate "manage access" permission, and
  nobody can restore their own. Restoring destroys the old password and emails a link to choose
  a new one; old sessions do not come back.
