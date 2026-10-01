-- Phase 7 payroll: monthly runs and items; adjustments link to the item that paid them; HR admin approves
-- payroll (accounting calculates it) and HR roles can read it.

-- AlterTable
ALTER TABLE "payroll_adjustments" ADD COLUMN     "payroll_item_id" UUID;

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "calculated_by" UUID NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "exported_by" UUID,
    "exported_at" TIMESTAMP(3),
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "branch_id" UUID,
    "paid_days" INTEGER NOT NULL,
    "basic_halalas" BIGINT NOT NULL,
    "housing_halalas" BIGINT NOT NULL,
    "transport_halalas" BIGINT NOT NULL,
    "other_halalas" BIGINT NOT NULL,
    "gross_halalas" BIGINT NOT NULL,
    "absence_halalas" BIGINT NOT NULL,
    "lateness_halalas" BIGINT NOT NULL,
    "unpaid_leave_halalas" BIGINT NOT NULL,
    "tiered_leave_halalas" BIGINT NOT NULL,
    "additions_halalas" BIGINT NOT NULL,
    "deductions_halalas" BIGINT NOT NULL,
    "gosi_employee_halalas" BIGINT NOT NULL,
    "gosi_employer_halalas" BIGINT NOT NULL,
    "net_halalas" BIGINT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "iban" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_company_id_period_key" ON "payroll_runs"("company_id", "period");

-- CreateIndex
CREATE INDEX "payroll_items_company_id_employee_id_idx" ON "payroll_items"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_run_id_employee_id_key" ON "payroll_items"("run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_status_check" CHECK ("status" IN ('calculated', 'approved', 'exported'));
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_paid_days_check" CHECK ("paid_days" BETWEEN 0 AND 30);
CREATE INDEX "payroll_adjustments_payroll_item_id_idx" ON "payroll_adjustments"("payroll_item_id");

INSERT INTO "permissions" ("id", "code") SELECT gen_random_uuid(), c.code FROM (VALUES ('payroll:read'), ('payroll:approve')) AS c(code) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT g.role_id::uuid, p."id", g.scope FROM (VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'payroll:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'payroll:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'payroll:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'payroll:approve', 'company'),
  ('00000000-0000-0000-0000-0000000000f5', 'payroll:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f7', 'payroll:read', 'branch')
) AS g(role_id, code, scope)
JOIN "permissions" p ON p."code" = g.code
WHERE EXISTS (SELECT 1 FROM "roles" r WHERE r."id" = g.role_id::uuid)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
