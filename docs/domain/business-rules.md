# Business rules

Rules marked **TBD** are not decided by the company yet. Agents must NOT invent them:
implement them as configurable settings with a safe default and flag them to the owner.

## Time and calendar

- Company time zone: `Asia/Riyadh`. A "work day" is a calendar date in that zone.
- Weekend days: configurable per company (default **Friday, Saturday** — confirmed for v1, ADR-0009).
- Public holidays: entered by HR per year in `holidays`.
- A working day = not weekend, not holiday.

## Attendance

- An employee has one `attendance_day` per work day and many raw `attendance_punches`.
- **Check-in accepted only if**:
  - distance (haversine) between phone location and the employee's branch ≤ `branch.radius_m`, and
  - GPS accuracy ≤ company setting `attendance.max_gps_accuracy_m` (default 100 m).
  **Check-out is checked the same way** (owner decision, ADR-0009).
  Rejected punches return a clear error and are NOT stored as valid punches (they are kept as
  rejected attempts for the record).
- Check-in and check-out alternate within a day; worked minutes = sum of in→out pairs.
- Schedule priority: employee's schedule → branch default schedule → company default (not modelled
  yet: without a schedule no lateness is computed). Schedules start and end on the same day — **no
  night shifts in v1**.
- `late_minutes = max(0, first_check_in − (schedule.start + late_grace_min))`.
- Status of a day: `present`, `late`, `absent`, `leave`, `holiday`, `weekend`.
- Nightly job (after the day ends in Asia/Riyadh): working days with no punch and no approved
  leave → `absent`. Days with check-in but no check-out → flagged `missing_checkout` for the manager.
- Corrections: only HR/manager (team scope), with a mandatory reason; audited. Nobody corrects their
  own day. A corrected day is never overwritten by later punches or the nightly job.
- Remote/field staff without a fixed branch: policy **TBD** — until decided they cannot punch
  (clear error `attendance.no_branch`).

## Leave

- Types (seeded, configurable): annual (21 days, deducts balance), sick, emergency (no yearly limit),
  unpaid — owner-approved defaults, ADR-0010.
- Requested days = working days between start and end (inclusive), excluding weekends/holidays.
  A request stays within one calendar year.
- Annual balance: 21 days granted in full on January 1st, no carry-over (defaults, ADR-0010). HR can
  set an individual employee's entitlement with a reason (e.g. 30 days after 5 years).
- Approval by the employee's manager (team reach) or HR (branch or company reach); nobody decides their own request; rejection needs a
  reason. On approval, in ONE transaction: update balance, set attendance days in range to `leave`,
  publish `leave.approved`. A pending request can be cancelled by the employee.
- Cannot overlap an existing approved/pending request. Cannot exceed balance for types that deduct
  balance (pending days count against it).

## Custody (عهدة)

- States: `requested → approved | rejected`, `approved → paid`, `paid → settled`.
- `paid` is set by the accountant after paying and recording it in Techno Link;
  requires `techno_link_ref` (free text in v1).
- `settled` when returned or justified; `settled_amount` may be less than the paid amount (never more).
- A pending request can be cancelled by the employee. Nobody approves, pays or settles their own
  request; every step is audited (ADR-0010).
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
  one. An invitation can only be accepted while the employee is active and has no
  account yet: accepting it for an inactive or already-linked employee is refused and
  creates nothing, so of two live links for one employee only the first used wins.
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

## Organization and access (ADR-0011, ADR-0012)

- One company, several branches. Every employee has exactly one **current** branch and department.
- A user sees and acts only within their **reach**: `own` (self), `team` (direct + indirect reports),
  `branch` (their home branch, or a chosen list of branches), `company` (all branches).
- Default: staff and managers get **branch reach on their home branch** automatically — a transfer
  moves their reach with them. Executives get `company` reach. A regional manager gets `branch`
  reach on a chosen list.
- Nobody approves, corrects, pays or settles their **own** request, whatever their role.
- Sensitive data needs its own permission (personal data, salary, contracts, insurance, warnings).
  The employee always sees their own.
- Role changes take effect immediately; every change is audited. You can only grant what you hold.
- **Flexible responsibilities:** one person may hold several roles; one responsibility may be held by
  several people. Requests go to **everyone** who holds the approving permission for that employee,
  and the first one to decide closes it for all. Approval never depends on one named person.
- **Salaries** are visible only to roles with `salary:read` (HR and Accounting by default) and to each
  employee for their own (decided 2026-09-30).

## Employment history and transfers

- A **transfer / promotion / manager change** creates a dated career record; the employee's
  current values change on the effective date (future dates allowed).
- Records tied to a moment (attendance day, leave, custody, warning, payroll line) keep the
  **branch they belonged to at the time**, so branch reports stay correct after a transfer.
- Pending requests at the moment of transfer stay with the branch they were filed in until decided
  (decided 2026-09-30).
- Employee numbers are unique per company and never change on transfer.
- A transfer needs a reason and the transfer permission reaching both branches. Its date can't be before the
  hire date or before the current assignment started (history is never rewritten). A backdated transfer does
  not move records already created: they keep the branch they were created in.
- Editing branch, department, job title, manager or schedule on the employee form is recorded as a change
  effective today.

## Contracts

- Each employee has one active contract at a time and a history of past ones.
- Fields: type, start date, end date (empty for open-ended), probation end, status, document.
- Contract types and legal periods (fixed-term vs open-ended, probation length): **TBD — confirm with
  HR/legal**; store as configurable lists, do not hard-code.
- Alerts before end date and end of probation (default 60 / 30 / 7 days, TBD). Renewal creates a new
  contract linked to the previous one.

## Personal data and contacts

- Personal data: gender, date of birth, marital status, nationality, national ID / iqama, personal
  phone and email, address, an **additional phone number**. Editable by HR; the employee edits
  contact details themselves (existing self-service rules).
- **Contacts:** any number of relatives or trusted persons: name, relationship, phone, whether
  they are the emergency contact, priority. Visible under the sensitive-data permission.

## Insurance

- A company keeps its insurance **policies** (provider, policy number, class, validity dates).
- An employee is enrolled in a policy with a member number, class, start and end date.
  Dependants: **TBD** (only if the company insures them).
- Alerts before an enrolment or policy ends (default 60 / 30 days, TBD).
- Social insurance (GOSI) registration is payroll data, handled in the payroll phase.

## Warnings (إنذارات)

- Flow: a manager/HR **proposes** → an authorised HR user **issues** (or rejects) → the employee
  **acknowledges** in the app. HR can **rescind** an issued warning, with a reason.
- Fields: type, reason, date of the incident, evidence document (optional), severity.
- The **ladder** (e.g. verbal → written → final → dismissal) and how long a warning stays "active":
  **TBD — company policy**; configurable, never hard-coded.
- A warning may link to a deduction, but never creates one by itself.
- Visible to the employee, their HR, and roles with `warnings:read` in scope — not to peers.

## Short permissions (الاستئذانات)

- A request for **part of a day**: late arrival, early leave, or leaving mid-day and returning.
  Fields: date, from-time, to-time (or minutes), reason.
- Approved by the manager (team) or branch HR; nobody approves their own.
- An approved short permission **excuses** the lateness or early leave on that day's attendance.
- Monthly allowance (hours or count) and whether hours are deducted from pay or from leave:
  **TBD — company policy**; settings with a documented default.

## Adjustments and deductions

- An **adjustment** is a dated pay change for one employee and period: `deduction`, `bonus` or
  `allowance`, with amount (halalas), reason and source (warning, absence, lateness, manual…).
- Flow: proposed → approved by a different person → included in the next payroll run. Approved
  adjustments are immutable; a mistake is corrected by a new opposite adjustment.
- Deduction rules (absence, lateness, unpaid leave, custody recovery) stay as listed under Payroll
  and are **TBD policy**. The law limits deductions from wages: **confirm the legal cap with HR/legal**
  and enforce it as a setting.

## Leave rules still to decide

- **Sick leave:** the law defines tiered sick pay (full, then reduced, then unpaid) and usually
  requires a medical certificate. Exact days, percentages and certificate rule: **TBD — confirm with
  HR/legal**; model as pay tiers per leave type; attachments on the request.
- **Emergency leave:** yearly limit and whether it deducts from annual leave: **TBD**.
- **Annual leave:** 21 days in full on 1 January, no carry-over (defaults, ADR-0010); long-service
  increase and accrual still **TBD** (HR can set an individual entitlement meanwhile).

## Alerts

- Rules are configurable per company: what to watch, when (days before), who is told (by role and
  reach), and by which channel (in-app, email).
- Built-in rules to implement: contract ending, probation ending, document expiring (exists),
  insurance expiring, missing check-out (exists), leave balance low, warnings count reaches a limit,
  employee without check-in for N working days (TBD).
- A nightly job evaluates rules; each alert is sent once per threshold (same idempotency approach as
  the document-expiry job, ADR-0006).

## Termination (later phase)

- Ending employment records a reason and last working day, closes the current contract, removes
  access (existing rules) and keeps all history. End-of-service award and final settlement:
  **TBD — payroll phase, needs HR/legal input.**
