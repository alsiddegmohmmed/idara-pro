-- Phase 5 employee file: personal fields, relatives/trusted contacts (emergency contact backfilled), contracts,
-- insurance policies + enrolment, and alert notices for expiry reminders. Adds the contracts:* / insurance:*
-- permissions (ADR-0011 §3) and grants them to the system roles as in apps/api/src/shared/access/system-roles.ts.
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "additional_phone" TEXT,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "marital_status" TEXT;

-- CreateTable
CREATE TABLE "employee_contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "probation_end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "renewed_from_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "policy_number" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_insurance" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "member_number" TEXT,
    "class" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_notices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_contacts_company_id_employee_id_idx" ON "employee_contacts"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_employee_id_idx" ON "contracts"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_status_end_date_idx" ON "contracts"("company_id", "status", "end_date");

-- CreateIndex
CREATE INDEX "insurance_policies_company_id_idx" ON "insurance_policies"("company_id");

-- CreateIndex
CREATE INDEX "employee_insurance_company_id_employee_id_idx" ON "employee_insurance"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "employee_insurance_policy_id_idx" ON "employee_insurance"("policy_id");

-- CreateIndex
CREATE INDEX "alert_notices_company_id_idx" ON "alert_notices"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_notices_kind_entity_id_threshold_days_key" ON "alert_notices"("kind", "entity_id", "threshold_days");

-- AddForeignKey
ALTER TABLE "employee_contacts" ADD CONSTRAINT "employee_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contacts" ADD CONSTRAINT "employee_contacts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_insurance" ADD CONSTRAINT "employee_insurance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_insurance" ADD CONSTRAINT "employee_insurance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_insurance" ADD CONSTRAINT "employee_insurance_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_notices" ADD CONSTRAINT "alert_notices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "employees" ADD CONSTRAINT "employees_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('male', 'female'));
ALTER TABLE "employees" ADD CONSTRAINT "employees_marital_status_check" CHECK ("marital_status" IS NULL OR "marital_status" IN ('single', 'married', 'divorced', 'widowed'));
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_type_check" CHECK ("type" IN ('fixed_term', 'open_ended'));
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_status_check" CHECK ("status" IN ('active', 'renewed', 'ended'));
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
-- One active contract per employee.
CREATE UNIQUE INDEX "contracts_one_active" ON "contracts"("employee_id") WHERE "status" = 'active';
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_dates_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "employee_insurance" ADD CONSTRAINT "employee_insurance_dates_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- The single emergency contact becomes the first contact.
INSERT INTO "employee_contacts" ("id", "company_id", "employee_id", "name", "relationship", "phone", "is_emergency", "created_at", "updated_at")
SELECT gen_random_uuid(), e."company_id", e."id", e."emergency_contact_name", 'other', e."emergency_contact_phone", true, now(), now()
FROM "employees" e
WHERE e."emergency_contact_name" IS NOT NULL AND e."emergency_contact_phone" IS NOT NULL;

INSERT INTO "permissions" ("id", "code") SELECT gen_random_uuid(), c.code FROM (VALUES ('contracts:read'), ('contracts:manage'), ('insurance:read'), ('insurance:manage')) AS c(code) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT g.role_id::uuid, p."id", g.scope FROM (VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'contracts:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'contracts:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'insurance:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f1', 'insurance:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'contracts:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'contracts:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'insurance:read', 'company'),
  ('00000000-0000-0000-0000-0000000000f4', 'insurance:manage', 'company'),
  ('00000000-0000-0000-0000-0000000000f7', 'contracts:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'contracts:manage', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'insurance:read', 'branch'),
  ('00000000-0000-0000-0000-0000000000f7', 'insurance:manage', 'branch')
) AS g(role_id, code, scope)
JOIN "permissions" p ON p."code" = g.code
WHERE EXISTS (SELECT 1 FROM "roles" r WHERE r."id" = g.role_id::uuid)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
