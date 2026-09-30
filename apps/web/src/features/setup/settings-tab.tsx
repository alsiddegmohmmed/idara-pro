import { COMPANY_SETTING_KEYS, PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { apiJson, jsonBody } from "@/lib/api";
import type { CompanySetting } from "./api";
import { setupError } from "./shared";

const todayIso = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** Each policy with the default the API applies when nothing is set. */
const POLICIES = [
  { key: COMPANY_SETTING_KEYS.MAX_GPS_ACCURACY_M, defaultValue: 100, id: "gps", unit: "meters", min: 1, max: 10_000 },
  { key: COMPANY_SETTING_KEYS.CONTRACT_PROBATION_DAYS, defaultValue: 90, id: "probation", unit: "days", min: 0, max: 365 },
  { key: COMPANY_SETTING_KEYS.ALERT_DAYS_BEFORE, defaultValue: 30, id: "alerts", unit: "days", min: 1, max: 365 },
] as const;

/** Company policies that change over time: each value applies from its date; history is kept. */
export function SettingsTab(): React.JSX.Element {
  const settings = useQuery({ queryKey: ["company-settings"], queryFn: () => apiJson<CompanySetting[]>("/api/v1/company-settings") });
  const { t } = useTranslation();
  if (settings.isLoading) return <Skeleton className="h-40" />;
  if (settings.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      {POLICIES.map((p) => (
        <PolicyCard key={p.key} policy={p} settings={settings.data ?? []} />
      ))}
    </div>
  );
}

function PolicyCard({ policy, settings }: { policy: (typeof POLICIES)[number]; settings: CompanySetting[] }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const key = policy.key;
  const amount = (n: number) => (policy.unit === "meters" ? t("setup.branches.meters", { count: n }) : t("setup.settings.days", { count: n }));
  const history = settings.filter((s) => s.key === key).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const current = history.find((s) => s.effectiveFrom.slice(0, 10) <= todayIso());

  const save = useMutation({
    mutationFn: () => apiJson(`/api/v1/company-settings/${key}`, { method: "PUT", ...jsonBody({ value: Number(value), effectiveFrom: from }) }),
    onSuccess: async () => {
      toast.success(t("setup.saved"));
      setValue("");
      await queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (e) => setError(setupError(t, e)),
  });

  const n = Number(value);
  return (
    <Panel>
      <PanelHeader title={t(`setup.settings.${policy.id}Title`)} />
      <p className="mb-4 text-body text-ink-muted">{t(`setup.settings.${policy.id}Hint`)}</p>
      <p className="mb-4 text-body">
        {t("setup.settings.current")}:{" "}
        <strong className="tabular-nums">{amount(Number(current?.value ?? policy.defaultValue))}</strong>
        {!current && <span className="text-ink-muted"> ({t("setup.settings.default")})</span>}
      </p>
      {history.length > 0 && (
        <ul className="mb-4 space-y-1 text-dense text-ink-muted">
          {history.map((h) => (
            <li key={h.id}>
              <bdi className="tabular-nums">{h.effectiveFrom.slice(0, 10)}</bdi> — {amount(Number(h.value))}
            </li>
          ))}
        </ul>
      )}
      {can(PERMISSIONS.ORG_MANAGE) && (
        <form
          className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <Field label={t(`setup.settings.newValue_${policy.unit}`)} htmlFor={`${policy.id}-value`}>
            <Input id={`${policy.id}-value`} dir="ltr" inputMode="numeric" className="w-32" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label={t("setup.settings.from")} htmlFor={`${policy.id}-from`}>
            <Input id={`${policy.id}-from`} type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Button type="submit" loading={save.isPending} disabled={value === "" || !(Number.isInteger(n) && n >= policy.min && n <= policy.max) || from === ""}>
            {t("common.saveChanges")}
          </Button>
          {error && <Alert className="w-full">{error}</Alert>}
        </form>
      )}
    </Panel>
  );
}
