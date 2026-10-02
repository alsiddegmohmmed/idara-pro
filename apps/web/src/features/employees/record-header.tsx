import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Label (13, muted) above value (15/500) — the record's definition grid (ui-spec §7.3). */
export function Fact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-body font-medium text-ink">{children ?? "—"}</dd>
    </div>
  );
}

/** Shows only the last 4 characters until the eye is pressed (values already masked by the API stay as they are). */
export function MaskedValue({ value }: { value: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  if (value.includes("•") || value.length <= 4) return <bdi className="tabular-nums">{value}</bdi>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <bdi dir="ltr" className="tabular-nums">{shown ? value : `••••••${value.slice(-4)}`}</bdi>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("employees.hideValue") : t("employees.showValue")}
        aria-pressed={shown}
        className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-canvas hover:text-ink"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </span>
  );
}
