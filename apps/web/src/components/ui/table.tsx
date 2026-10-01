import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Table: white panel, muted 13/500 header on canvas, 52px rows (44 dense),
// 1px line between rows, no zebra, hover = canvas, tabular numbers.
export function Table({
  className,
  busy = false,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  /**
   * The rows still belong to the previous filter (date, month, period) while the new ones load:
   * dimmed and not clickable, so nobody acts on a row under the wrong heading.
   */
  busy?: boolean;
}): React.JSX.Element {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn(
        "relative w-full overflow-x-auto rounded-panel border border-line bg-surface transition-opacity",
        busy && "pointer-events-none select-none opacity-60",
      )}
    >
      <table className={cn("w-full border-collapse text-dense tabular-nums", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <thead className={cn("bg-canvas", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement> & { dense?: boolean }>(
  ({ className, dense = false, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "transition-colors hover:bg-canvas",
        dense ? "h-11" : "h-[52px]",
        props.onClick && "cursor-pointer",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return (
    <th
      scope="col"
      className={cn("h-11 border-b border-line px-4 text-start align-middle text-meta font-medium text-ink-muted", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <td className={cn("px-4 py-2 align-middle text-ink", className)} {...props} />;
}
