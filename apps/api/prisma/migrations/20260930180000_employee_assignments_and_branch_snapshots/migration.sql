-- ADR-0012: career history (employee_assignments) and branch snapshots on time-bound records.
-- Backfill: one current "hire" row per existing employee (valid_from = hire_date) and every existing
-- attendance day / leave request / custody request gets the employee's current branch.
-- AlterTable
ALTER TABLE "attendance_days" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "custody_requests" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "branch_id" UUID;

-- CreateTable
CREATE TABLE "employee_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "branch_id" UUID,
    "department_id" UUID,
    "job_title" TEXT,
    "manager_id" UUID,
    "schedule_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "applied_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_assignments_company_id_employee_id_valid_from_idx" ON "employee_assignments"("company_id", "employee_id", "valid_from");

-- CreateIndex
CREATE INDEX "employee_assignments_company_id_applied_at_valid_from_idx" ON "employee_assignments"("company_id", "applied_at", "valid_from");

-- CreateIndex
CREATE INDEX "attendance_days_company_id_branch_id_work_date_idx" ON "attendance_days"("company_id", "branch_id", "work_date");

-- CreateIndex
CREATE INDEX "custody_requests_company_id_branch_id_created_at_idx" ON "custody_requests"("company_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "leave_requests_company_id_branch_id_start_date_idx" ON "leave_requests"("company_id", "branch_id", "start_date");

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one current (applied, open-ended) row per employee, and at most one scheduled change.
CREATE UNIQUE INDEX "employee_assignments_one_current" ON "employee_assignments"("employee_id") WHERE "applied_at" IS NOT NULL AND "valid_to" IS NULL;
CREATE UNIQUE INDEX "employee_assignments_one_scheduled" ON "employee_assignments"("employee_id") WHERE "applied_at" IS NULL;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_kind_check" CHECK ("kind" IN ('hire', 'transfer', 'change'));
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");

INSERT INTO "employee_assignments" ("id", "company_id", "employee_id", "kind", "branch_id", "department_id", "job_title",
  "manager_id", "schedule_id", "valid_from", "applied_at", "reason", "created_at", "updated_at")
SELECT gen_random_uuid(), e."company_id", e."id", 'hire', e."branch_id", e."department_id", e."job_title",
  e."manager_id", e."schedule_id", e."hire_date", now(), NULL, now(), now()
FROM "employees" e;

UPDATE "attendance_days" d SET "branch_id" = e."branch_id" FROM "employees" e WHERE e."id" = d."employee_id";
UPDATE "leave_requests" r SET "branch_id" = e."branch_id" FROM "employees" e WHERE e."id" = r."employee_id";
UPDATE "custody_requests" c SET "branch_id" = e."branch_id" FROM "employees" e WHERE e."id" = c."employee_id";
