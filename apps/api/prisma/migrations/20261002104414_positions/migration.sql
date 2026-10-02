-- Job titles as a managed list (ux-redesign-v2 PR F): positions per company, employees.position_id.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "position_id" UUID;

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "department_id" UUID,
    "occupation_code" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_company_id_idx" ON "positions"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_company_id_name_ar_key" ON "positions"("company_id", "name_ar");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (ux-redesign-v2 §5): one position per distinct job title already typed in each company, and
-- every employee linked to theirs. job_title stays as the snapshot it already is.
INSERT INTO "positions" ("id", "company_id", "name_ar", "created_at", "updated_at")
SELECT gen_random_uuid(), "company_id", btrim("job_title"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "employees"
WHERE "job_title" IS NOT NULL AND btrim("job_title") <> ''
GROUP BY "company_id", btrim("job_title");

UPDATE "employees" e
SET "position_id" = p."id"
FROM "positions" p
WHERE p."company_id" = e."company_id" AND p."name_ar" = btrim(e."job_title");
