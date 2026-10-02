-- ux-redesign-v2 PR G: the employee's statement on a warning (heard before a penalty, Labor Law art. 71).

-- AlterTable
ALTER TABLE "warnings" ADD COLUMN     "employee_statement" TEXT,
ADD COLUMN     "statement_declined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statement_recorded_at" TIMESTAMP(3),
ADD COLUMN     "statement_recorded_by" UUID;
