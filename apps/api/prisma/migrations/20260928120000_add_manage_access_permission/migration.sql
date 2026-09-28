-- employees:manage-access (docs/adr/0008): restoring a deactivated employee's login is its own
-- permission, separate from employees:update. Idempotent, like the Employee role migration.
-- Granted to the Owner role and to any role named "HR" (case-insensitive) that already exists;
-- every other role gets it only when an admin assigns it.

INSERT INTO "permissions" ("id", "code")
VALUES (gen_random_uuid(), 'employees:manage-access')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'company'
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" = 'employees:manage-access'
  AND (r."id" = '00000000-0000-0000-0000-0000000000f1' OR lower(r."name") = 'hr')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
