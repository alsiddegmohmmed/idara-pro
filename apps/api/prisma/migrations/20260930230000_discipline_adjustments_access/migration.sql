-- Phase 6: warnings, short permissions (الاستئذانات), payroll adjustments, and the excused late minutes on
-- attendance days. Adds warnings:*, shortleave:*, adjustments:* and grants them to the system roles as in
-- apps/api/src/shared/access/system-roles.ts.
-- AlterTable
ALTER TABLE "attendance_days" ADD COLUMN     "excused_min" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "warnings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "incident_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposed_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "rescinded_by" UUID,
    "rescinded_at" TIMESTAMP(3),
    "rescinded_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortleave_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "from_time" TEXT NOT NULL,
    "to_time" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortleave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_halalas" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposed_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warnings_company_id_employee_id_idx" ON "warnings"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "warnings_company_id_status_idx" ON "warnings"("company_id", "status");

-- CreateIndex
CREATE INDEX "warnings_company_id_branch_id_incident_date_idx" ON "warnings"("company_id", "branch_id", "incident_date");

-- CreateIndex
CREATE INDEX "shortleave_requests_company_id_employee_id_date_idx" ON "shortleave_requests"("company_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "shortleave_requests_company_id_status_idx" ON "shortleave_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "shortleave_requests_company_id_branch_id_date_idx" ON "shortleave_requests"("company_id", "branch_id", "date");

-- CreateIndex
CREATE INDEX "payroll_adjustments_company_id_period_status_idx" ON "payroll_adjustments"("company_id", "period", "status");

-- CreateIndex
CREATE INDEX "payroll_adjustments_company_id_employee_id_period_idx" ON "payroll_adjustments"("company_id", "employee_id", "period");

-- CreateIndex
CREATE INDEX "payroll_adjustments_company_id_branch_id_period_idx" ON "payroll_adjustments"("company_id", "branch_id", "period");

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortleave_requests" ADD CONSTRAINT "shortleave_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortleave_requests" ADD CONSTRAINT "shortleave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "warnings" ADD CONSTRAINT "warnings_type_check" CHECK ("type" IN ('verbal', 'written', 'final'));
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_status_check" CHECK ("status" IN ('proposed', 'issued', 'rejected', 'rescinded'));
ALTER TABLE "shortleave_requests" ADD CONSTRAINT "shortleave_kind_check" CHECK ("kind" IN ('late_arrival', 'early_leave', 'mid_day'));
ALTER TABLE "shortleave_requests" ADD CONSTRAINT "shortleave_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled'));
ALTER TABLE "shortleave_requests" ADD CONSTRAINT "shortleave_minutes_check" CHECK ("minutes" > 0);
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "adjustments_kind_check" CHECK ("kind" IN ('deduction', 'bonus', 'allowance'));
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "adjustments_status_check" CHECK ("status" IN ('proposed', 'approved', 'rejected'));
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "adjustments_amount_check" CHECK ("amount_halalas" > 0);
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "adjustments_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

INSERT INTO "permissions" ("id", "code") SELECT gen_random_uuid(), c.code FROM (VALUES ('warnings:read'), ('warnings:propose'), ('warnings:issue'), ('warnings:rescind'), ('shortleave:request'), ('shortleave:read'), ('shortleave:approve'), ('adjustments:read'), ('adjustments:propose'), ('adjustments:approve')) AS c(code) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT g.role_id::uuid, p."id", g.scope FROM (VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'warnings:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'warnings:propose', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'warnings:issue', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'warnings:rescind', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'shortleave:request', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'shortleave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'shortleave:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'adjustments:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'adjustments:propose', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'adjustments:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f2', 'shortleave:request', 'own'),
  ('00000000-0000-0000-0000-0000000000f3', 'warnings:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f3', 'shortleave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'warnings:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'warnings:propose', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'warnings:issue', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'warnings:rescind', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'shortleave:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'shortleave:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'adjustments:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'adjustments:propose', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'adjustments:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'adjustments:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f6', 'warnings:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'warnings:propose', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'shortleave:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f6', 'shortleave:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'warnings:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'warnings:propose', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'warnings:issue', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'warnings:rescind', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'shortleave:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'shortleave:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'adjustments:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'adjustments:propose', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'adjustments:approve', 'branch'),
  ('00000000-0000-0000-0000-0000000000f8', 'warnings:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'warnings:propose', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'shortleave:read', 'team'),
  ('00000000-0000-0000-0000-0000000000f8', 'shortleave:approve', 'team')
) AS g(role_id, code, scope)
JOIN "permissions" p ON p."code" = g.code
WHERE EXISTS (SELECT 1 FROM "roles" r WHERE r."id" = g.role_id::uuid)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
