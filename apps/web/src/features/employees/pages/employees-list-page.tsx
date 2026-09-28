import { PERMISSIONS } from "@idara-pro/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { useEmployees } from "../api";

export function EmployeesListPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const { data, isLoading, isError } = useEmployees();
  const nameOf = (e: { fullNameAr: string; fullNameEn: string }): string =>
    i18n.language === "ar" ? e.fullNameAr : e.fullNameEn;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("employees.title")}</h1>
        {can(PERMISSIONS.EMPLOYEES_CREATE) && (
          <Link to="/employees/new">
            <Button>{t("employees.add")}</Button>
          </Link>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {isError && <p role="alert" className="text-destructive">{t("common.loadFailed")}</p>}
      {data && data.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("employees.empty")}
        </p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-start text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.employeeNo")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.name")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.jobTitle")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.status")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.account")}</th>
                <th className="px-4 py-2 text-start font-medium">{t("employees.fields.ibanReview")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-muted">
                  <td className="px-4 py-2" dir="ltr">{e.employeeNo}</td>
                  <td className="px-4 py-2">
                    <Link to={`/employees/${e.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {nameOf(e)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.jobTitle ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={e.status === "active" ? "approved" : "neutral"}>{t(`employees.status.${e.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={e.userId ? "approved" : "neutral"}>
                      {e.userId ? t("employees.account.linked") : t("employees.account.none")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {e.ibanReviewStatus === "pending_review" && <Badge tone="pending">{t("review.status.pending_review")}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
