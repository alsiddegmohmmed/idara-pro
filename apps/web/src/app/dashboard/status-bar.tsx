import { cn } from "@/lib/utils";

export interface StatusSegment {
  key: string;
  label: string;
  count: number;
  /** A status token class (bg-success …): status colours are reserved for state and always carry a word. */
  colorClass: string;
}

/**
 * Part-to-whole of one day (dataviz: stacked bar, 2px surface gap between segments, legend with words
 * and counts so identity is never colour-alone; each segment has a hover/focus tooltip).
 */
export function StatusBar({ segments, label }: { segments: StatusSegment[]; label: string }): React.JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const visible = segments.filter((s) => s.count > 0);
  return (
    <figure className="space-y-4">
      <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.count}`).join("، ")}`} className="flex h-6 w-full gap-0.5">
        {total === 0 ? (
          <div className="h-full w-full rounded-control bg-neutral-soft" />
        ) : (
          visible.map((s, i) => (
            <div
              key={s.key}
              tabIndex={0}
              className={cn(
                "group relative h-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                s.colorClass,
                i === 0 && "rounded-s-[4px]",
                i === visible.length - 1 && "rounded-e-[4px]",
              )}
              style={{ width: `${(s.count / total) * 100}%`, minWidth: 6 }}
            >
              <span className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-meta text-white shadow-float group-hover:block group-focus-visible:block rtl:translate-x-1/2">
                {s.label}: <span className="tabular-nums">{s.count}</span> ({Math.round((s.count / total) * 100)}%)
              </span>
            </div>
          ))
        )}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-meta text-ink-muted">
              <span className={cn("size-2.5 rounded-full", s.colorClass)} aria-hidden="true" />
              {s.label}
              <span className="font-semibold tabular-nums text-ink">{s.count}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
