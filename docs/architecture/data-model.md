# Data model (PostgreSQL)

Conventions for every business table:
`id uuid` (UUID v7) · `company_id uuid not null` · `created_at timestamptz` · `updated_at timestamptz` ·
`created_by uuid` · soft delete `deleted_at timestamptz` where history matters.
Money = `bigint` halalas (`*_halalas`). Snake_case in DB, camelCase in Prisma via `@map`.

## Company
| Table | Key columns |
|---|---|
| `companies` | name_ar, name_en, cr_number, vat_number, timezone, weekend_days int[] |
| `branches` | name, lat, lng, radius_m, default_schedule_id, techno_link_branch_code |
| `work_schedules` | name, start_time, end_time, late_grace_min, work_days int[] |
| `holidays` | date, name, paid — unique (company_id, date) |
| `company_settings` | key, value jsonb, effective_from (GOSI rates, deduction policies, GPS accuracy…) |

## Auth
| Table | Key columns |
|---|---|
| `users` | email (unique), phone, password_hash, status, last_login_at |
| `roles` | name, is_system |
| `permissions` | code (`resource:action`) |
| `role_permissions` | role_id, permission_id, scope (`own`,`team`,`branch`,`company`) |
| `user_roles` | user_id, role_id |
| `refresh_tokens` | user_id, family_id, token_hash, expires_at, revoked_at |
| `invitations` | email, employee_id, token_hash, expires_at, accepted_at |

## Employees
| Table | Key columns |
|---|---|
| `employees` | user_id (unique, nullable until invite accepted), employee_no, full_name_ar, full_name_en, national_id / iqama_no (unique per company), nationality, is_saudi, job_title, department_id, branch_id, manager_id → employees, schedule_id, hire_date, end_date, status |
| `departments` | name, parent_id |
| `salary_components` | employee_id, type (basic, housing, transport, other), amount_halalas, effective_from, effective_to |
| `employee_documents` | employee_id, type, number, issue_date, expiry_date, file_key |

## Attendance
| Table | Key columns |
|---|---|
| `attendance_days` | employee_id, work_date — unique pair; status, late_min, worked_min, flags |
| `attendance_punches` | attendance_day_id, kind (in/out), at, lat, lng, accuracy_m, distance_m, accepted bool, reject_reason, device_info, idempotency_key |
| `attendance_corrections` | attendance_day_id, old_values jsonb, new_values jsonb, reason, corrected_by |

## Leave
| Table | Key columns |
|---|---|
| `leave_types` | code, name_ar, name_en, paid, deducts_balance, default_days |
| `leave_balances` | employee_id, leave_type_id, year, entitled_days, used_days — unique triple |
| `leave_requests` | employee_id, leave_type_id, start_date, end_date, days, reason, status, decided_by, decided_at, decision_note |

## Custody
| Table | Key columns |
|---|---|
| `custody_requests` | employee_id, amount_halalas, purpose, status, approved_by, paid_at, paid_by, techno_link_ref, settled_at, settled_amount_halalas |

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
| `notifications` | user_id, type, title, body, link, read_at |
| `audit_log` | actor_id, action, entity, entity_id, before jsonb, after jsonb, ip, at — append-only |
| `idempotency_keys` | key, user_id, request_hash, response jsonb, expires_at |
