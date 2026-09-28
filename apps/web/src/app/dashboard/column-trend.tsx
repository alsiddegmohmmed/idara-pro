import { cn } from "@/lib/utils";

export interface TrendPoint {
  key: string;
  label: string; // axis label (short weekday)
  value: number; // 0–100 (%)
  detail: string; // tooltip text
}

/**
 * One series over time as columns (dataviz: single hue, ≤24px columns, 4px rounded caps square at the
 * baseline, hairline grid, value labelled only on the latest column, hover/focus tooltip on every column,
 * and a visually hidden table as the table view).
 */
export function ColumnTrend({ points, caption, valueSuffix = "%" }: { points: TrendPoint[]; caption: string; valueSuffix?: string }): React.JSX.Element {
  const last = points.length - 1;
  return (
    <figure>
      <div className="relative h-44">
        {[0, 50, 100].map((tick) => (
          <div key={tick} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${tick}%` }}>
            <span className="w-9 text-end text-[11px] tabular-nums text-ink-muted">
              {tick}
              {valueSuffix}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ))}
        <div className="absolute inset-y-0 end-0 start-11 flex items-end justify-around" aria-hidden="true">
          {points.map((p, i) => (
            <div key={p.key} tabIndex={0} className="group relative flex h-full w-full max-w-16 items-end justify-center outline-none">
              <div
                className={cn(
                  "w-full max-w-6 rounded-t-[4px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2",
                  "bg-primary",
                  i !== last && "opacity-70 group-hover:opacity-100",
                )}
                style={{ height: `${Math.max(p.value, 1.5)}%` }}
              />
              {i === last && (
                <span className="absolute text-meta font-semibold tabular-nums text-ink" style={{ bottom: `calc(${p.value}% + 4px)` }}>
                  {Math.round(p.value)}
                  {valueSuffix}
                </span>
              )}
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-control bg-ink px-2 py-1 text-meta text-white shadow-float group-hover:block group-focus-visible:block">
                {p.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="ms-11 mt-2 flex justify-around" aria-hidden="true">
        {points.map((p) => (
          <span key={p.key} className="w-full max-w-16 text-center text-[11px] text-ink-muted">
            {p.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{p.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
