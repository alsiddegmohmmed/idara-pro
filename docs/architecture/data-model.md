# Data model (PostgreSQL)

Conventions for every business table:
`id uuid` (UUID v7) · `company_id uuid not null` · `created_at timestamptz` · `updated_at timestamptz` ·
`created_by uuid` · soft delete `deleted_at timestamptz` where history matters.
Money = `bigint` halalas (`*_halalas`). Snake_case in DB, camelCase in Prisma via `@map`.
**Branch snapshot (ADR-0012):** tables whose rows belong to a moment in time (attendance, leave, custody,
warnings, short leave, payroll lines, adjustments) also carry `branch_id` (the employee's branch when the
row was created), indexed as `(company_id, branch_id, <date>)`. Branch-scope filters use it; no joins.

Tables marked **(planned)** are designed but not migrated yet; the roadmap says when.

## Company
| Table | Key columns |
|---|---|
| `companies` | name_ar, name_en, cr_number, vat_number, timezone, weekend_days int[] |
| `branches` | name, lat, lng, radius_m, default_schedule_id, techno_link_branch_code |
| `work_schedules` | name, start_time, end_time, late_grace_min, work_days int[] |
| `holidays` | date, name, paid — unique (company_id, date) |
| `company_settings` | key, value jsonb, effective_from (GOSI rates, deduction policies, GPS accuracy…) |

## Auth
Two tables here break the "every table has company_id" convention on purpose
(docs/adr/0004-rls-deferred.md): `permissions` is a global catalog, and `roles` rows
with `is_system = true` have `company_id = null` (a company's own custom roles don't).

| Table | Key columns |
|---|---|
| `users` | email (unique per company), phone, password_hash, status, last_login_at |
| `roles` | name, is_system, company_id (nullable — null for system roles) |
| `permissions` | code (`resource:action`) — global, no company_id |
| `role_permissions` | role_id, permission_id, scope (`own`,`team`,`branch`,`company`) |
| `user_roles` | user_id, role_id — **replaced by `role_assignments` (planned, ADR-0011)** |
| `role_assignments` (planned) | id, company_id, user_id, role_id, branch_mode (`home` / `selected`; only used for `branch` reach), valid_from, valid_to (temporary delegation), created_by |
| `assignment_branches` (planned) | assignment_id, branch_id — the branches of a `selected` assignment |
| `users.access_revoked_at` (planned) | set when a user is disabled; the cached access snapshot is dropped on every role/assignment/status change |
| `refresh_tokens` | user_id, family_id, token_hash, expires_at, revoked_at |
| `password_reset_tokens` | user_id, token_hash, expires_at, used_at — Stage 4, not in the original design; delivery (email) waits for the notifications module |
| `invitations` | employee_id, email, token_hash, expires_at, accepted_at, created_by — owned by the auth module, not employees (docs/adr/0007-invitations.md) |

## Employees
| Table | Key columns |
|---|---|
| `employees` | user_id (unique, nullable until invite accepted), employee_no, full_name_ar, full_name_en, national_id / iqama_no (unique per company), nationality, is_saudi, job_title, department_id, branch_id, manager_id → employees, schedule_id, hire_date, end_date, status |
| `departments` | name, parent_id |
| `salary_components` | employee_id, type (basic, housing, transport, other), amount_halalas, effective_from, effective_to |
| `employee_documents` | employee_id, type, number, issue_date, expiry_date, file_key, content_type, original_filename, size_bytes, checksum_sha256 |

## Employee file (planned)
| Table | Key columns |
|---|---|
| `employee_assignments` | employee_id, branch_id, department_id, job_title, manager_id, schedule_id, valid_from, valid_to (null = current), reason, created_by — exactly one current row per employee; `employees.*` keeps the current values (ADR-0012) |
| `employee_personal` (or columns on `employees`) | gender, date_of_birth, marital_status, additional_phone, work_phone |
| `employee_contacts` | employee_id, name, relationship, phone, is_emergency, priority |
| `contracts` | employee_id, type (configurable list), start_date, end_date (null = open-ended), probation_end, status (`active`, `ended`, `renewed`), renewed_from_id, document_id |
| `insurance_policies` | provider, policy_no, class, valid_from, valid_to |
| `employee_insurance` | employee_id, policy_id, member_no, class, start_date, end_date |
| `employee_documents` | already built — later split visibility under `documents:*` |

## Discipline, short permissions, adjustments, alerts (planned)
| Table | Key columns |
|---|---|
| `warnings` | employee_id, branch_id (snapshot), type, severity, reason, incident_date, status (`proposed`, `issued`, `rejected`, `rescinded`), proposed_by, issued_by, issued_at, acknowledged_at, rescinded_reason, document_id |
| `shortleave_requests` | employee_id, branch_id (snapshot), date, kind (`late_arrival`, `early_leave`, `mid_day`), from_time, to_time, minutes, reason, status, decided_by, decided_at, decision_note |
| `payroll_adjustments` | employee_id, branch_id (snapshot), period (`YYYY-MM`), kind (`deduction`, `bonus`, `allowance`), amount_halalas, reason, source (`warning`, `absence`, `lateness`, `manual`, `custody`), source_id, status (`proposed`, `approved`, `rejected`), proposed_by, approved_by, payroll_item_id |
| `alert_rules` | key (e.g. `contract_ending`), enabled, thresholds int[] (days), recipients (role codes + reach), channels |
| `alert_notices` | rule_key, entity, entity_id, threshold — unique together; makes each alert fire once (like `document_expiry_notices`) |
| `leave_types` (extend) | requires_attachment, pay_tiers jsonb (days + pay %), yearly_limit_days |
| `leave_requests` (extend) | attachment file key; branch_id snapshot |

## Attendance
| Table | Key columns |
|---|---|
| `attendance_days` | employee_id, work_date — unique pair; status (null = still open), first_in_at, last_out_at, late_min, worked_min, missing_checkout, corrected (ADR-0009) |
| `attendance_punches` | employee_id, attendance_day_id (null for rejected attempts), kind (in/out), at, lat, lng, accuracy_m, distance_m, accepted bool, reject_reason, device_info — idempotency lives in `idempotency_keys` |
| `attendance_corrections` | attendance_day_id, old_values jsonb, new_values jsonb, reason, corrected_by |

## Leave
| Table | Key columns |
|---|---|
| `leave_types` | code, name_ar, name_en, paid, deducts_balance, default_days (null = no yearly limit), active — seeded per company (ADR-0010) |
| `leave_balances` | employee_id, leave_type_id, year, entitled_days, used_days — unique triple |
| `leave_requests` | employee_id, leave_type_id, start_date, end_date, days, reason, status (pending, approved, rejected, cancelled), decided_by, decided_at, decision_note |

## Custody
| Table | Key columns |
|---|---|
| `custody_requests` | employee_id, amount_halalas, purpose, status (requested, approved, rejected, cancelled, paid, settled), decided_by, decided_at, decision_note, paid_at, paid_by, techno_link_ref, settled_at, settled_by, settled_amount_halalas, settlement_note |

## Payroll
| Table | Key columns |
|---|---|
| `payroll_runs` | period (YYYY-MM), type (regular, adjustment), status, calculated_at, approved_by, approved_at, totals jsonb — unique (company_id, period, type) where type = regular |
| `payroll_items` | run_id, employee_id, basic, allowances, deductions, gosi_employee, gosi_employer, net (all halalas), breakdown jsonb |
| `payslips` | payroll_item_id, file_key, published_at |

## Exports, notifications, audit
| Table | Key columns |
|---|---|
| `exports` | type (payroll, custody), reference_id, file_key, exported_by, exported_at |
| `notifications` | recipient_user_id, type, title_key, body_params jsonb, entity, entity_id, read_at — titleKey/bodyParams not pre-rendered text, so the frontend renders in the viewer's own locale (ADR-0006) |
| `document_expiry_notices` | document_id, threshold_days (or -1 = "expired"), notified_at — unique(document_id, threshold_days); the expiry job's idempotency record (ADR-0006) |
| `audit_log` | actor_id, action, entity, entity_id, before jsonb, after jsonb, ip, at — append-only |
| `idempotency_keys` | user_id, scope, key — unique triple per company; request_hash, response jsonb, expires_at (ADR-0009) |
