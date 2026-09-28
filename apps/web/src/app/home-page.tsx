import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth";
import { nameIn } from "@/features/employees/employee-name";
import { apiJson } from "@/lib/api";
import { formatLongDate, riyadhHour } from "@/lib/dates";
import type { Employee } from "@/lib/types";
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
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiJson<Employee>("/api/v1/me/profile"), enabled: selfService, retry: false });

  const now = new Date();
  const greeting = riyadhHour(now) < 12 ? t("home.morning") : t("home.evening");
  const firstName = me.data ? nameIn(i18n, me.data).split(/\s+/)[0] : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? t("home.greeting", { greeting, name: firstName }) : greeting}
        description={formatLongDate(now, i18n.language)}
        actions={
          can(PERMISSIONS.EMPLOYEES_CREATE) ? (
            <Button asChild icon={<Plus />}>
              <Link to="/employees/new">{t("employees.add")}</Link>
            </Button>
          ) : can(PERMISSIONS.ATTENDANCE_PUNCH) ? (
            <Button asChild>
              <Link to="/my-attendance">{t("attendance.checkIn")}</Link>
            </Button>
          ) : undefined
        }
      />
      {manages && <HrDashboard />}
      {manages && me.data && <h2 className="text-section">{t("home.mySection")}</h2>}
      {me.data && <EmployeeDashboard me={me.data} />}
      {!manages && !selfService && <p className="text-body text-ink-muted">{t("home.nothingYet")}</p>}
    </div>
  );
}
