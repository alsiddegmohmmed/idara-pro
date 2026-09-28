-- Reference data the app needs to work at all (docs/adr/0008): the permissions the Employee role
-- uses (the two Stage 4 ones + notifications:read),
-- the default "Employee" system role (fixed id, see src/shared/auth/default-roles.ts) and
-- its role_permissions. Idempotent, so it is safe on a database the dev seed already touched.
-- Production is only ever migrated (`prisma migrate deploy`), never seeded.

INSERT INTO "permissions" ("id", "code")
SELECT gen_random_uuid(), c.code
FROM (VALUES ('employees:review'), ('employees:self-service'), ('notifications:read')) AS c(code)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "roles" ("id", "company_id", "name", "is_system", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-0000000000f2', NULL, 'Employee', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT '00000000-0000-0000-0000-0000000000f2', p."id", 'own'
FROM "permissions" p
WHERE p."code" IN ('employees:self-service', 'notifications:read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- The Owner role (if it exists) gets the new permissions too.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'company'
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."id" = '00000000-0000-0000-0000-0000000000f1'
  AND p."code" IN ('employees:review', 'employees:self-service')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Backfill: accounts created by an accepted invitation before this role existed have no
-- permissions at all (Stage 3 gap). Give them the baseline; never touch users that already have a role.
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT e."user_id", '00000000-0000-0000-0000-0000000000f2'
FROM "employees" e
WHERE e."user_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "user_roles" ur WHERE ur."user_id" = e."user_id")
ON CONFLICT ("user_id", "role_id") DO NOTHING;
