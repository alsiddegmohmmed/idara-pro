-- CreateEnum
CREATE TYPE "salary_component_type" AS ENUM ('basic', 'housing', 'transport', 'other');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('iqama', 'passport', 'national_id', 'contract', 'other');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "salary_component_type" NOT NULL,
    "amount_halalas" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "document_type" NOT NULL,
    "number" TEXT NOT NULL,
    "issue_date" DATE,
    "expiry_date" DATE,
    "file_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_components_company_id_idx" ON "salary_components"("company_id");

-- CreateIndex
CREATE INDEX "salary_components_employee_id_idx" ON "salary_components"("employee_id");

-- CreateIndex
CREATE INDEX "employee_documents_company_id_idx" ON "employee_documents"("company_id");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
