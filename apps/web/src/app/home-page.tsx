import { PERMISSIONS } from "@idara-pro/shared";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { formatLongDate, riyadhHour } from "@/lib/dates";
import { EmployeeDashboard } from "./dashboard/employee-dashboard";
import { HrDashboard } from "./dashboard/hr-dashboard";

/**
 * ui-spec §7.6. People who manage others (HR, managers, accountants) get the company/team picture;
 * everyone with an employee record also gets their own day. Every panel only appears with its permission.
 */
export function HomePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const selfService = can(PERMISSIONS.EMPLOYEES_SELF_SERVICE);
  const manages =
    can(PERMISSIONS.EMPLOYEES_READ) ||
    can(PERMISSIONS.EMPLOYEES_REVIEW) ||
    can(PERMISSIONS.ATTENDANCE_READ) ||
    can(PERMISSIONS.LEAVE_READ) ||
    can(PERMISSIONS.CUSTODY_READ);
  const { employee } = useMyEmployee();

  const now = new Date();
  const greeting = riyadhHour(now) < 12 ? t("home.morning") : t("home.evening");
  const firstName = employee ? nameIn(i18n, employee).split(/\s+/)[0] : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? t("home.greeting", { greeting, name: firstName }) : greeting}
        description={formatLongDate(now, i18n.language)}
        actions={
          // Employees get check-in in the "my day" card below, so the header carries only HR's main action.
          can(PERMISSIONS.EMPLOYEES_CREATE) ? (
            <Button asChild icon={<Plus />}>
              <Link to="/employees/new">{t("employees.add")}</Link>
            </Button>
          ) : undefined
        }
      />
      {manages && <HrDashboard />}
      {manages && employee && <h2 className="text-section">{t("home.mySection")}</h2>}
      {employee && <EmployeeDashboard me={employee} />}
      {!manages && !selfService && <p className="text-body text-ink-muted">{t("home.nothingYet")}</p>}
    </div>
  );
}
