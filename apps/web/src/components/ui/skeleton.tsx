import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ui-spec §5 Skeleton: grey blocks matching the layout; no whole-page spinners.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-neutral-soft", className)} {...props} />;
}

/** Announces "loading" once for a block of skeletons. */
function Loading({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div role="status" className={className}>
      <span className="sr-only">{t("common.loading")}</span>
      {children}
    </div>
  );
}

/**
 * A table while it loads (ux-redesign-v2 §1.2): the same panel, header band and 52px rows as `Table`,
 * so the real rows replace it without the page changing height.
 */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }): React.JSX.Element {
  return (
    <Loading className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className="flex h-11 items-center gap-6 bg-canvas px-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-line" />
        ))}
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex h-[52px] items-center gap-6 px-4">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-48", c === columns - 1 && "max-w-24")} />
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A list of cards/rows (inbox, my requests) while it loads. */
export function ListSkeleton({ rows = 3, rowClassName = "h-[72px]" }: { rows?: number; rowClassName?: string }): React.JSX.Element {
  return (
    <Loading className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </Loading>
  );
}

/** A definition grid (label above value) while it loads — the record header and detail sections. */
export function FactsSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  return (
    <Loading className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-36 max-w-full" />
        </div>
      ))}
    </Loading>
  );
}

/** An employee record (header card, tab bar, first tab) while it loads. */
export function RecordSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="rounded-panel border border-s-4 border-line border-s-primary bg-surface">
        <div className="flex items-start gap-4 p-6">
          <Skeleton className="size-[72px] rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-6 w-56 max-w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="border-t border-line p-6">
          <FactsSkeleton count={6} />
        </div>
      </div>
      <div className="flex gap-6 border-b border-line pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
      <FactsSkeleton count={9} />
    </div>
  );
}
