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
- Export is saved (`exports` table + file in MinIO) and the run becomes `exported`.

## Documents

- Types: Iqama, passport, national ID, contract, other. Expiry reminders at 60, 30, 7 days (TBD).
