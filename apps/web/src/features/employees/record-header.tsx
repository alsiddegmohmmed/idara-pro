import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/lib/types";
import { nameIn } from "./employee-name";

/** Label (13, muted) above value (15/500) — the record's definition grid (ui-spec §7.3). */
export function Fact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-body font-medium text-ink">{children ?? "—"}</dd>
    </div>
  );
}

/** ID-card style header: 4px petrol band on the inline-start, avatar, name, status, key facts. */
export function RecordHeader({
  employee,
  actions,
  facts,
}: {
  employee: Employee;
  actions?: ReactNode;
  facts: ReactNode;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <section className="rounded-panel border border-s-4 border-line border-s-primary bg-surface">
      <div className="flex flex-wrap items-start gap-4 p-6">
        <Avatar name={employee.fullNameAr} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-page-title text-ink">{nameIn(i18n, employee)}</h1>
            <Badge tone={employee.status === "active" ? "success" : "neutral"} dot>
              {t(`employees.status.${employee.status}`)}
            </Badge>
          </div>
          {employee.jobTitle && <p className="mt-1 text-body text-ink-muted">{employee.jobTitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <dl className="grid gap-x-8 gap-y-4 border-t border-line p-6 sm:grid-cols-2 lg:grid-cols-3">{facts}</dl>
    </section>
  );
}

