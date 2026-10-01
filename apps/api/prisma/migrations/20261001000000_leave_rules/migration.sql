-- Leave rules (owner defaults 2026-10-01): sick-leave pay tiers + medical certificate, emergency leave
-- with its own yearly balance (5 days, separate from annual leave).

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "attachment_key" TEXT,
ADD COLUMN     "attachment_name" TEXT,
ADD COLUMN     "attachment_type" TEXT;

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "pay_tiers" JSONB,
ADD COLUMN     "requires_attachment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_pay_tiers_array"
  CHECK ("pay_tiers" IS NULL OR jsonb_typeof("pay_tiers") = 'array');

-- Sick leave: Labor Law art. 117 default — 30 days full pay, 60 days at 75%, 30 days unpaid per year;
-- a medical certificate is required. Only types still on their original defaults are touched.
UPDATE "leave_types"
SET "pay_tiers" = '[{"days":30,"percent":100},{"days":60,"percent":75},{"days":30,"percent":0}]'::jsonb,
    "requires_attachment" = true
WHERE "code" = 'sick' AND "pay_tiers" IS NULL;

-- Emergency leave: its own balance of 5 working days a year (not taken from annual leave).
UPDATE "leave_types"
SET "deducts_balance" = true, "default_days" = 5
WHERE "code" = 'emergency' AND "deducts_balance" = false AND "default_days" IS NULL;

-- Balances for emergency leave already approved this way, so used days aren't lost.
INSERT INTO "leave_balances" ("id", "company_id", "employee_id", "leave_type_id", "year", "entitled_days", "used_days", "created_at", "updated_at")
SELECT gen_random_uuid(), r."company_id", r."employee_id", r."leave_type_id", EXTRACT(YEAR FROM r."start_date")::int,
       GREATEST(5, SUM(r."days")::int), SUM(r."days")::int, now(), now()
FROM "leave_requests" r
JOIN "leave_types" t ON t."id" = r."leave_type_id"
WHERE t."code" = 'emergency' AND r."status" = 'approved'
GROUP BY r."company_id", r."employee_id", r."leave_type_id", EXTRACT(YEAR FROM r."start_date")
ON CONFLICT DO NOTHING;
