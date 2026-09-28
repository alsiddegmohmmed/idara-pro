import { PERMISSIONS } from "@idara-pro/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <h1 className="text-page-title">{t("employees.title")}</h1>
        {can(PERMISSIONS.EMPLOYEES_CREATE) && (
          <Button asChild>
            <Link to="/employees/new">{t("employees.add")}</Link>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      )}
      {isError && <p role="alert" className="text-danger">{t("common.loadFailed")}</p>}
      {data && data.length === 0 && (
        <p className="rounded-panel border border-line bg-surface p-8 text-center text-ink-muted">
          {t("employees.empty")}
        </p>
      )}
      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("employees.fields.employeeNo")}</TableHead>
              <TableHead>{t("employees.fields.name")}</TableHead>
              <TableHead>{t("employees.fields.jobTitle")}</TableHead>
              <TableHead>{t("employees.fields.status")}</TableHead>
              <TableHead>{t("employees.fields.account")}</TableHead>
              <TableHead>{t("employees.fields.ibanReview")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {data.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <bdi>{e.employeeNo}</bdi>
                </TableCell>
                <TableCell>
                  <Link to={`/employees/${e.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                    {nameOf(e)}
                  </Link>
                </TableCell>
                <TableCell>{e.jobTitle ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone={e.status === "active" ? "success" : "neutral"}>{t(`employees.status.${e.status}`)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={e.userId ? "success" : "neutral"}>
                    {e.userId ? t("employees.account.linked") : t("employees.account.none")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {e.ibanReviewStatus === "pending_review" && <Badge tone="warning">{t("review.status.pending_review")}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
