-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('requested', 'approved', 'rejected', 'cancelled', 'paid', 'settled');

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "deducts_balance" BOOLEAN NOT NULL,
    "default_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" INTEGER NOT NULL,
    "used_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount_halalas" BIGINT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "CustodyStatus" NOT NULL DEFAULT 'requested',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "paid_by" UUID,
    "paid_at" TIMESTAMP(3),
    "techno_link_ref" TEXT,
    "settled_by" UUID,
    "settled_at" TIMESTAMP(3),
    "settled_amount_halalas" BIGINT,
    "settlement_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_company_id_code_key" ON "leave_types"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_company_id_employee_id_leave_type_id_year_key" ON "leave_balances"("company_id", "employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_company_id_employee_id_start_date_idx" ON "leave_requests"("company_id", "employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_company_id_status_idx" ON "leave_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "custody_requests_company_id_status_idx" ON "custody_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "custody_requests_company_id_employee_id_idx" ON "custody_requests"("company_id", "employee_id");

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_requests" ADD CONSTRAINT "custody_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_requests" ADD CONSTRAINT "custody_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default leave types for every existing company (ADR-0010 defaults; HR can change them later).
INSERT INTO "leave_types" ("id", "company_id", "code", "name_ar", "name_en", "paid", "deducts_balance", "default_days", "updated_at")
SELECT gen_random_uuid(), c."id", t.code, t.name_ar, t.name_en, t.paid, t.deducts, t.days, now()
FROM "companies" c
CROSS JOIN (VALUES
  ('annual', 'إجازة سنوية', 'Annual leave', true, true, 21),
  ('sick', 'إجازة مرضية', 'Sick leave', true, false, NULL),
  ('emergency', 'إجازة اضطرارية', 'Emergency leave', true, false, NULL),
  ('unpaid', 'إجازة بدون راتب', 'Unpaid leave', false, false, NULL)
) AS t(code, name_ar, name_en, paid, deducts, days)
ON CONFLICT ("company_id", "code") DO NOTHING;

-- Phase 3 permissions (idempotent, same pattern as earlier permission migrations).
INSERT INTO "permissions" ("id", "code")
VALUES (gen_random_uuid(), 'leave:read'), (gen_random_uuid(), 'leave:request'), (gen_random_uuid(), 'leave:approve'),
       (gen_random_uuid(), 'custody:read'), (gen_random_uuid(), 'custody:request'), (gen_random_uuid(), 'custody:approve'),
       (gen_random_uuid(), 'custody:pay'), (gen_random_uuid(), 'custody:settle'), (gen_random_uuid(), 'exports:create')
ON CONFLICT ("code") DO NOTHING;

-- Owner: everything, company scope.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT '00000000-0000-0000-0000-0000000000f1', p."id", 'company'
FROM "permissions" p
WHERE p."code" IN ('leave:read', 'leave:request', 'leave:approve', 'custody:read', 'custody:request', 'custody:approve',
                   'custody:pay', 'custody:settle', 'exports:create')
  AND EXISTS (SELECT 1 FROM "roles" WHERE "id" = '00000000-0000-0000-0000-0000000000f1')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Employee: request leave and custody for themselves.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT '00000000-0000-0000-0000-0000000000f2', p."id", 'own'
FROM "permissions" p
WHERE p."code" IN ('leave:request', 'custody:request')
  AND EXISTS (SELECT 1 FROM "roles" WHERE "id" = '00000000-0000-0000-0000-0000000000f2')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- HR (company), Manager (team), Accountant (company) — only if roles with those names exist.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", CASE WHEN lower(r."name") = 'manager' THEN 'team' ELSE 'company' END
FROM "roles" r
JOIN "permissions" p ON
  (lower(r."name") = 'hr' AND p."code" IN ('leave:read', 'leave:approve', 'custody:read', 'custody:approve', 'custody:settle'))
  OR (lower(r."name") = 'manager' AND p."code" IN ('leave:read', 'leave:approve', 'custody:read', 'custody:approve'))
  OR (lower(r."name") = 'accountant' AND p."code" IN ('custody:read', 'custody:pay', 'custody:settle', 'exports:create'))
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
