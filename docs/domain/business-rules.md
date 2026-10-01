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

- Types (seeded, configurable in Company setup → Leave types): annual (21 days, deducts balance), sick
  (pay tiers + certificate, below), emergency (own balance of 5 days a year, separate from annual leave), unpaid
  — owner-approved defaults, ADR-0010 and 2026-10-01.
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

- One run per company and month (`YYYY-MM`): `calculated → approved → exported`. Accounting calculates
  (`payroll:run`, company reach) and can recalculate as often as needed; a **different person** approves
  (`payroll:approve`, HR admin by default). Approval locks the run: items, the settings used and the adjustments it
  paid never change. Corrections go into a later month as adjustments; adjustments for an approved month are refused.
  Approval is possible only **after the month has ended** (every day closed by attendance), and is refused if
  recalculating now would change any line — attendance, leave, salary, employee dates or adjustments ("recalculate
  first"). After approval, late changes for that month (a leave approved late, an attendance correction) are not
  re-priced: enter the difference as an adjustment in a later month.
- Who is paid: everyone employed for at least one day of the month (hire date / end date). Deactivating an employee
  without an end date sets it to that day. Leave and absences outside the employment are ignored; a day on approved
  leave is never also an absence.
- Owner defaults 2026-10-01 — all company settings with start dates (Company setup → Settings):
  - **30-day month:** a full month = 30 paid days whatever its length; a joiner/leaver is paid for the calendar days
    employed (max 30). Components in force on the last employed day of the month are used.
  - **Absence:** per absent day (attendance status `absent`) = (basic + housing) / 30 (setting: or basic / 30).
  - **Lateness:** per late minute = (basic + housing) / 30 / scheduled day minutes. Late minutes are already net of the
    schedule's grace and of approved short permissions (setting: on/off).
  - **Unpaid leave:** per day = full monthly wage / 30. **Tiered leave (sick):** the unpaid part of each day by the
    leave type's tiers (e.g. a 75% day deducts 25% of the daily wage).
  - **Adjustments:** approved bonuses/allowances added, approved deductions subtracted.
  - **GOSI:** on basic + housing up to a cap (default SAR 45,000). Saudi: employee 9.75%, employer 11.75%; non-Saudi:
    employee 0%, employer 2%. **Confirm the current rates with GOSI before go-live** (newer rules phase in higher
    rates for new entrants).
- Net = gross + additions − absence − lateness − unpaid leave − unpaid sick part − deductions − GOSI (employee).
- Warnings shown before approval (never block): negative net, deductions over the cap, no salary, no IBAN.
- Every item stores a breakdown (days, minutes, adjustments, warnings) so any number can be explained.
- Employees see their own payslip once the run is approved and are notified ("payslip ready").
- Custody recovery: only if HR adds it as an adjustment.

## Techno Link export (v1)

- Available for runs in state `approved` (or already `exported`). Produces an Excel file (first export marks the run
  `exported`); full IBANs only for people allowed to see that employee's personal data:
  - Sheet "Summary": totals per expense category (salaries, housing, transport, other allowances, GOSI employer).
  - Sheet "Employees": one row per employee with each component.
  - Custody export: paid custody in a date range.
- Only a company-wide export marks the run `exported`; a branch user's export contains their branch's lines only.
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

## Signing in (decided 2026-10-01)

- Employees sign in with their **national ID / iqama number** (10 digits, 1… or 2…) and password; Arabic-Indic digits
  are accepted. The ID number is required in that format on every employee record. Only accounts **without** an
  employee record (e.g. the system admin) sign in with an email. Forgot password works the same way; the reset link
  goes to the account's email.
- Passwords: 8–128 characters, not digits only (not an ID, phone or date). Stored as Argon2id hashes.
- Protection: the same answer and similar timing for unknown account / wrong password / disabled account; after
  **5 wrong passwords** an ID is locked for **15 minutes**; **50 wrong attempts** from one IP in 15 minutes block that IP
  for the rest of the window (only failures count, so an office sharing one connection isn't blocked). Every
  successful sign-in and every failure on a real account is in the audit log.
- Later (not built): two-factor sign-in for HR / payroll roles.

## Organization and access (ADR-0011, ADR-0012)

- One company, several branches. Every employee has exactly one **current** branch and department.
- A user sees and acts only within their **reach**: `own` (self), `team` (direct + indirect reports),
  `branch` (their home branch, or a chosen list of branches), `company` (all branches).
- Default: staff and managers get **branch reach on their home branch** automatically — a branch correction
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

## Branches are separate businesses (decided 2026-09-30)

- A branch is a separate business under the company, not a city outlet. Employees are **not transferred**
  between branches; there is no transfer workflow or screen.
- If an employee's branch was entered wrongly, HR corrects it on the employee record (needs reach over both
  branches). Records already created (attendance days, leave, custody) keep the branch they were created in,
  so each business's reports and approvers stay correct; a pending request stays with its original branch.
- Edits of branch, department, job title, manager or schedule are kept as history (effective the day of the
  edit), visible to auditors; the past is never rewritten.
- Employee numbers are unique per company and **assigned automatically** on create: `E-0001`, `E-0002`, … (the next
  after the highest `E-` number in use; HR doesn't type it). An explicit number is still accepted by the API (imports).

## Contracts

- Each employee has one active contract at a time and a history of past ones.
- Fields: type, start date, end date (empty for open-ended), probation end, status, document.
- Contract types (decided 2026-09-30, "defaults"): fixed-term (needs an end date) and open-ended. Probation defaults to
  90 days (company setting, editable per contract; renewals have none by default). Medical insurance covers the
  employee only for now; dependants later. Earlier note, kept for context: **TBD — confirm with
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
- Types (v1 default): **verbal / written / final**. Dismissal is not a warning type — it is a separate HR decision.
- A warning stays **active** for `warnings.active_days` (default **180 days** from the incident date; a company
  setting). Expired warnings stay on file, shown as "no longer active".
- The exact **ladder** (how many of each before the next step) is **TBD — company policy**; v1 does not enforce one.
- Nobody proposes, issues or rescinds a warning about themselves. Acknowledging means "seen", not "agreed".
- A warning may link to a deduction, but never creates one by itself.
- Visible to the employee, their HR, and roles with `warnings:read` in scope — not to peers.

## Short permissions (الاستئذانات)

- A request for **part of a day**: late arrival, early leave, or leaving mid-day and returning.
  Fields: date, from-time, to-time (or minutes), reason.
- Approved by the manager (team) or branch HR; nobody approves their own.
- An approved **late-arrival** permission excuses that many late minutes on the day's attendance
  (`attendance_days.excused_min`). Early leave and mid-day are recorded but attendance does not measure them yet.
- Monthly allowance: `shortleave.monthly_minutes`, default **240 minutes (4 hours)** per employee per calendar
  month; pending requests count against it. Requests may be filed up to 7 days late, on working days only,
  and may not overlap another pending/approved one.
- Whether minutes beyond the allowance are deducted from pay or from leave: **TBD — company policy** (v1 blocks them).

## Adjustments and deductions

- An **adjustment** is a dated pay change for one employee and period: `deduction`, `bonus` or
  `allowance`, with amount (halalas), reason and source (warning, absence, lateness, manual…).
- Flow: proposed → approved by a different person → included in the next payroll run. Approved
  adjustments are immutable; a mistake is corrected by a new opposite adjustment.
- Deduction rules (absence, lateness, unpaid leave, custody recovery) stay as listed under Payroll
  and are **TBD policy**.
- **Cap:** approved deductions for a month may not exceed `adjustments.max_deduction_percent` of that month's pay
  (salary components in force). Default **50%** (Labor Law) — **confirm with HR/legal**. With no salary on file
  a deduction is refused.
- Adjustments may target the previous month (late corrections) or any later month, never older.

## Leave rules (owner defaults 2026-10-01 — confirm with HR/legal)

- **Sick leave:** paid in tiers by days already used in the **calendar year** — 30 days full pay, next 60 days
  at 75%, next 30 days unpaid; past the last tier unpaid (Labor Law art. 117 default; the law counts the year from
  the first sick day — v1 simplifies to the calendar year). Tiers are a setting per leave type. A **medical
  certificate** (PDF/JPG/PNG, ≤ 10 MB) must be attached before approval; the employee can attach it with the request
  or later while it is pending. It can be downloaded by the employee, whoever can decide the request, and holders of
  `employees:read-sensitive` — not by every leave reader. Payroll reads the tiers (Phase 7).
- **Emergency leave:** required; its own yearly balance of **5 working days** (setting), paid, not taken from
  annual leave. Statutory occasion leave (marriage, bereavement, newborn) can be added as further leave types.
- Any leave type can require a supporting document (`requires_attachment`).
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
