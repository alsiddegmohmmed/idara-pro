-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'absent', 'leave', 'holiday', 'weekend');

-- CreateEnum
CREATE TYPE "PunchKind" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "status" "AttendanceStatus",
    "first_in_at" TIMESTAMP(3),
    "last_out_at" TIMESTAMP(3),
    "late_min" INTEGER NOT NULL DEFAULT 0,
    "worked_min" INTEGER NOT NULL DEFAULT 0,
    "missing_checkout" BOOLEAN NOT NULL DEFAULT false,
    "corrected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_day_id" UUID,
    "kind" "PunchKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "distance_m" DOUBLE PRECISION,
    "accepted" BOOLEAN NOT NULL,
    "reject_reason" TEXT,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "attendance_day_id" UUID NOT NULL,
    "old_values" JSONB NOT NULL,
    "new_values" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "corrected_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_settings_company_id_idx" ON "company_settings"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_company_id_key_effective_from_key" ON "company_settings"("company_id", "key", "effective_from");

-- CreateIndex
CREATE INDEX "attendance_days_company_id_work_date_idx" ON "attendance_days"("company_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_company_id_employee_id_work_date_key" ON "attendance_days"("company_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_punches_company_id_employee_id_at_idx" ON "attendance_punches"("company_id", "employee_id", "at");

-- CreateIndex
CREATE INDEX "attendance_punches_attendance_day_id_idx" ON "attendance_punches"("attendance_day_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_attendance_day_id_idx" ON "attendance_corrections"("attendance_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_company_id_user_id_scope_key_key" ON "idempotency_keys"("company_id", "user_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_attendance_day_id_fkey" FOREIGN KEY ("attendance_day_id") REFERENCES "attendance_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_day_id_fkey" FOREIGN KEY ("attendance_day_id") REFERENCES "attendance_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 permissions (idempotent, same pattern as the manage-access migration).
-- attendance:punch: every employee checks in/out for themselves (Employee role, own scope; Owner too).
-- attendance:read / attendance:correct: Owner and any role named "HR" get company scope; a "Manager"
-- role gets team scope (their direct reports). Other roles get them only when an admin assigns them.
INSERT INTO "permissions" ("id", "code")
VALUES (gen_random_uuid(), 'attendance:punch'),
       (gen_random_uuid(), 'attendance:read'),
       (gen_random_uuid(), 'attendance:correct')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'own'
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" = 'attendance:punch'
  AND r."id" IN ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'company'
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" IN ('attendance:read', 'attendance:correct')
  AND (r."id" = '00000000-0000-0000-0000-0000000000f1' OR lower(r."name") = 'hr')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'team'
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."code" IN ('attendance:read', 'attendance:correct')
  AND lower(r."name") = 'manager'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
