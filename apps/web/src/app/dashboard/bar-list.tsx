/** Ranked magnitudes as horizontal bars (single hue; value in text ink at the tip; label above the bar). */
export function BarList({ rows, emptyText }: { rows: Array<{ key: string; label: string; value: number }>; emptyText: string }): React.JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-body text-ink-muted">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-dense">
            <span className="truncate text-ink">{r.label}</span>
            <span className="font-semibold tabular-nums text-ink">{r.value}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-soft">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
