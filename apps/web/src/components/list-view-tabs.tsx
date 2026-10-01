import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ListView = "pending" | "all";

/** The list's view in the URL (?view=pending|all), so a link or a reload keeps it. */
export function useListView(fallback: ListView = "pending"): [ListView, (v: ListView) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view: ListView = raw === "pending" || raw === "all" ? raw : fallback;
  return [
    view,
    (v) => {
      const next = new URLSearchParams(params);
      next.set("view", v);
      setParams(next, { replace: true });
    },
  ];
}

/**
 * The one pattern for request lists (ui-spec §5): tabs "بانتظار الإجراء / الكل", then an optional filters row.
 * Every module page uses it, so "what's waiting" vs "history" looks and works the same everywhere.
 */
export function ListViewTabs({ value, onChange, pendingCount, filters }: { value: ListView; onChange: (v: ListView) => void; pendingCount?: number; filters?: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <Tabs value={value} onValueChange={(v) => onChange(v as ListView)}>
        <TabsList>
          <TabsTrigger value="pending">
            {t("common.view.pending")}
            {pendingCount !== undefined && pendingCount > 0 && <span className="ms-1.5 rounded-full bg-warning-soft px-1.5 text-meta text-warning">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="all">{t("common.view.all")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
    </div>
  );
}
