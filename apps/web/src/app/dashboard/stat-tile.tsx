import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A headline number (dataviz: a single value is a stat tile, not a chart). Whole tile links to the detail page. */
const TONES = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  to,
  loading = false,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  to?: string;
  loading?: boolean;
  /** Colour carries meaning only (ui-spec §2): present = success, absent = danger, waiting = warning … */
  tone?: keyof typeof TONES;
}): React.JSX.Element {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta font-medium text-ink-muted">{label}</p>
        <span className={cn("flex size-11 items-center justify-center rounded-panel", TONES[tone])} aria-hidden="true">
          <Icon className="size-[22px]" strokeWidth={1.75} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-20" />
      ) : (
        <p className="mt-2 text-[28px] font-semibold leading-9 tabular-nums text-ink">{value}</p>
      )}
      {sub && !loading && <p className="mt-1 text-meta text-ink-muted">{sub}</p>}
    </>
  );
  const className = "block rounded-panel border border-line bg-surface p-5";
  return to ? (
    <Link to={to} className={cn(className, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
