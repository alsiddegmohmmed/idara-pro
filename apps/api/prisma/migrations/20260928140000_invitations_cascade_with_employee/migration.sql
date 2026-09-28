-- An employee added by mistake (or removed) must be deletable even if they were invited: their
-- invitations are meaningless without them. Was ON DELETE RESTRICT, so DELETE /employees/:id failed
-- with a raw foreign-key error for any invited employee.
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_employee_id_fkey";
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
