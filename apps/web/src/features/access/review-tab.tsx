import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRefs } from "@/features/employees/api";
import { permissionKey, useAccessReview } from "./api";

/** Access review (ADR-0011 §5): who can do what, where — from the same data the server enforces. */
export function ReviewTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const review = useAccessReview(true);
  const branches = useRefs("branches");
  const [query, setQuery] = useState("");
  const branchNames = (ids: string[]): string => ids.map((id) => branches.data?.find((b) => b.id === id)?.name ?? "—").join("، ");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (review.data ?? []).filter(
      (r) =>
        !q ||
        r.email.toLowerCase().includes(q) ||
        r.employeeName?.ar.includes(q) ||
        r.employeeName?.en.toLowerCase().includes(q) ||
        r.permissions.some((p) => p.code.includes(q) || t(permissionKey(p.code)).toLowerCase().includes(q)),
    );
  }, [review.data, query, t]);

  if (review.isLoading) return <TableSkeleton />;
  if (review.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      <p className="text-body text-ink-muted">{t("access.review.hint")}</p>
      <div className="max-w-sm">
        <Input placeholder={t("access.review.search")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("access.review.search")} />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("access.people.empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-64">{t("access.people.person")}</TableHead>
              <TableHead>{t("access.review.canDo")}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="align-top">
                  <div className="font-medium">{r.employeeName ? (i18n.language === "ar" ? r.employeeName.ar : r.employeeName.en) : <bdi>{r.email}</bdi>}</div>
                  <div className="text-meta text-ink-muted">
                    <bdi>{r.email}</bdi>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.length === 0 && <span className="text-dense text-ink-muted">{t("access.people.noRoles")}</span>}
                    {r.permissions.map((p) => (
                      <Badge key={p.code} tone={p.reach === "company" ? "warning" : "neutral"}>
                        {t(permissionKey(p.code))} · {t(`access.reach.${p.reach}`)}
                        {p.reach === "branch" && p.branchIds.length > 0 && <> ({branchNames(p.branchIds)})</>}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
