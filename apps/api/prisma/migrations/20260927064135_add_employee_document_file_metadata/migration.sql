/*
  Warnings:

  - Added the required column `checksum_sha256` to the `employee_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `original_filename` to the `employee_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size_bytes` to the `employee_documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "employee_documents" ADD COLUMN     "checksum_sha256" TEXT NOT NULL,
ADD COLUMN     "original_filename" TEXT NOT NULL,
ADD COLUMN     "size_bytes" INTEGER NOT NULL;
