-- Phase 4 access foundation (docs/adr/0011-access-control.md).
-- 1. role_assignments + assignment_branches replace user_roles (every existing grant is kept, branch_mode home).
-- 2. Permission catalog v2: company:* -> org:*, new codes (access, salary, read-sensitive, transfer, leave:manage, audit).
-- 3. System roles get fixed ids, keys and bilingual names; their grants are reset to
--    apps/api/src/shared/access/system-roles.ts (the SQL below was generated from that file).
-- Forward-only; safe on a database the dev seed already touched.

-- ---------- 1. roles columns, assignments ----------
ALTER TABLE "roles" ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "description" TEXT,
ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "key" TEXT,
ADD COLUMN "name_ar" TEXT;
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "branch_mode" TEXT NOT NULL DEFAULT 'home',
    "valid_from" DATE,
    "valid_to" DATE,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_assignments_branch_mode_check" CHECK ("branch_mode" IN ('home', 'selected')),
    CONSTRAINT "role_assignments_dates_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from")
);

CREATE TABLE "assignment_branches" (
    "assignment_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "assignment_branches_pkey" PRIMARY KEY ("assignment_id","branch_id")
);

CREATE INDEX "role_assignments_company_id_user_id_idx" ON "role_assignments"("company_id", "user_id");
CREATE INDEX "role_assignments_role_id_idx" ON "role_assignments"("role_id");
CREATE INDEX "assignment_branches_branch_id_idx" ON "assignment_branches"("branch_id");

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_branches" ADD CONSTRAINT "assignment_branches_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignment_branches" ADD CONSTRAINT "assignment_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every user_roles row becomes an open-ended assignment on the user's home branch.
INSERT INTO "role_assignments" ("id", "company_id", "user_id", "role_id", "branch_mode", "created_at", "updated_at")
SELECT gen_random_uuid(), u."company_id", ur."user_id", ur."role_id", 'home', now(), now()
FROM "user_roles" ur
JOIN "users" u ON u."id" = ur."user_id";

DROP TABLE "user_roles";

-- ---------- 2. permission catalog v2 ----------
INSERT INTO "permissions" ("id", "code")
SELECT gen_random_uuid(), c.code FROM (VALUES
  ('access:read'),
  ('access:manage'),
  ('org:read'),
  ('org:manage'),
  ('employees:read'),
  ('employees:read-sensitive'),
  ('employees:create'),
  ('employees:update'),
  ('employees:delete'),
  ('employees:invite'),
  ('employees:review'),
  ('employees:self-service'),
  ('employees:manage-access'),
  ('employees:transfer'),
  ('salary:read'),
  ('salary:manage'),
  ('attendance:punch'),
  ('attendance:read'),
  ('attendance:correct'),
  ('leave:read'),
  ('leave:request'),
  ('leave:approve'),
  ('leave:manage'),
  ('custody:read'),
  ('custody:request'),
  ('custody:approve'),
  ('custody:pay'),
  ('custody:settle'),
  ('payroll:read'),
  ('payroll:run'),
  ('payroll:approve'),
  ('exports:create'),
  ('notifications:read'),
  ('audit:read')
) AS c(code)
ON CONFLICT ("code") DO NOTHING;

-- Company (custom) roles keep what they could do, under the new codes.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT rp."role_id", np."id", rp."scope"
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id"
JOIN "permissions" np ON np."code" = CASE WHEN op."code" = 'company:read' THEN 'org:read' ELSE 'org:manage' END
WHERE op."code" IN ('company:read', 'company:create', 'company:update', 'company:delete')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Salary and personal data were readable with employees:read; now they need their own permissions.
-- Only roles that could already edit employees (HR-like) keep them, at the same reach.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT rp."role_id", np."id", rp."scope"
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."code" = 'employees:update'
JOIN "permissions" np ON np."code" IN ('salary:read', 'salary:manage', 'employees:read-sensitive')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Reviewers saw the full IBAN; that is personal data now.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT rp."role_id", np."id", rp."scope"
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."code" = 'employees:review'
JOIN "permissions" np ON np."code" = 'employees:read-sensitive'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Entitlements were for company-wide leave approvers; that is leave:manage now.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT rp."role_id", np."id", 'company'
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."code" = 'leave:approve'
JOIN "permissions" np ON np."code" = 'leave:manage'
WHERE rp."scope" = 'company'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" LIKE 'company:%');
DELETE FROM "permissions" WHERE "code" LIKE 'company:%';

-- ---------- 3. system roles ----------
INSERT INTO "roles" ("id", "company_id", "key", "name", "name_ar", "description", "is_system", "is_template", "created_at", "updated_at") VALUES
  ('00000000-0000-0000-0000-0000000000f1', NULL, 'super_admin', 'Super admin', 'مدير النظام', 'Everything, including managing roles and access.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f2', NULL, 'employee', 'Employee', 'موظف', 'Self-service: own profile, salary, attendance, leave and custody requests.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f3', NULL, 'executive', 'Executive', 'الإدارة العليا', 'Read-only view of every branch. No salaries, no personal data.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f4', NULL, 'hr_admin', 'HR admin', 'مسؤول الموارد البشرية', 'Runs HR for the whole company, including salaries and personal data.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f5', NULL, 'accountant', 'Accountant', 'المحاسب', 'Salaries (read), payroll, paying and settling custody, exports.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f6', NULL, 'manager', 'Branch manager', 'مدير فرع', 'Their branch: attendance, leave and custody approvals. No salaries.', true, false, now(), now()),
  ('00000000-0000-0000-0000-0000000000f7', NULL, 'branch_hr', 'Branch HR', 'موارد بشرية - فرع', 'HR admin''s work, limited to the branches it is assigned to.', true, true, now(), now()),
  ('00000000-0000-0000-0000-0000000000f8', NULL, 'team_lead', 'Team lead', 'قائد فريق', 'Their direct and indirect reports: attendance, leave and custody approvals.', true, true, now(), now())
ON CONFLICT ("id") DO UPDATE SET "key" = EXCLUDED."key", "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "description" = EXCLUDED."description", "is_system" = true, "is_template" = EXCLUDED."is_template", "updated_at" = now();

DELETE FROM "role_permissions" WHERE "role_id" IN ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f8');

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT g.role_id::uuid, p."id", g.scope FROM (VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'access:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'access:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'org:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:read-sensitive', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:create', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:update', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:delete', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:invite', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:review', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:self-service', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:manage-access', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'employees:transfer', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'salary:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'salary:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'attendance:punch', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'attendance:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'attendance:correct', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'leave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'leave:request', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'leave:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'leave:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'custody:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'custody:request', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'custody:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'custody:pay', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'custody:settle', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'payroll:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'payroll:run', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'payroll:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'exports:create', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'notifications:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'audit:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f2', 'employees:self-service', 'own'),
  ('00000000-0000-0000-0000-0000000000f2', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f2', 'attendance:punch', 'own'),
  ('00000000-0000-0000-0000-0000000000f2', 'leave:request', 'own'),
  ('00000000-0000-0000-0000-0000000000f2', 'custody:request', 'own'),
  ('00000000-0000-0000-0000-0000000000f3', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'employees:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'attendance:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'leave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'custody:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f4', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:read-sensitive', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:create', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:update', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:delete', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:invite', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:review', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:manage-access', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'employees:transfer', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'salary:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'salary:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'attendance:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'attendance:correct', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'leave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'leave:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'leave:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'custody:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'custody:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'custody:settle', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'exports:create', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f4', 'org:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'access:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'audit:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'employees:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'salary:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'payroll:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'payroll:run', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'custody:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'custody:pay', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'custody:settle', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'exports:create', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f6', 'employees:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'attendance:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'attendance:correct', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'leave:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'leave:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'custody:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'custody:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f6', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f7', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:read-sensitive', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:create', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:update', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:delete', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:invite', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:review', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:manage-access', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'employees:transfer', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'salary:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'salary:manage', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'attendance:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'attendance:correct', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'leave:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'leave:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'leave:manage', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'custody:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'custody:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'custody:settle', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'exports:create', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'notifications:read', 'own'),
  ('00000000-0000-0000-0000-0000000000f8', 'employees:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'attendance:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'attendance:correct', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'leave:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'leave:approve', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'custody:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'custody:approve', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'org:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f8', 'notifications:read', 'own')
) AS g(role_id, code, scope)
JOIN "permissions" p ON p."code" = g.code;
