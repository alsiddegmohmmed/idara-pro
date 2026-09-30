-- The audit viewer lists newest first per company (keyset on at, id).
-- CreateIndex
CREATE INDEX "audit_log_company_id_at_id_idx" ON "audit_log"("company_id", "at" DESC, "id" DESC);

