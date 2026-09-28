-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('pending_review', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "employee_documents" ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "review_status" "review_status" NOT NULL DEFAULT 'pending_review';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "address" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "iban_review_reason" TEXT,
ADD COLUMN     "iban_review_status" "review_status",
ADD COLUMN     "pending_iban" TEXT,
ADD COLUMN     "personal_email" TEXT,
ADD COLUMN     "phone" TEXT;

-- Documents that existed before this change were uploaded by HR: already vetted.
UPDATE "employee_documents" SET "review_status" = 'approved';
