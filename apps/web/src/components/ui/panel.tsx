import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Panel: white, 1px line, radius 10, padding 24, no shadow.
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <section className={cn("rounded-panel border border-line bg-surface p-6", className)} {...props} />;
}

/** Optional header row: section title + actions at inline-end, separated by a line. */
export function PanelHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("-mx-6 -mt-6 mb-6 flex items-center justify-between gap-4 border-b border-line px-6 py-4", className)}>
      <PanelTitle>{title}</PanelTitle>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h2 className={cn("text-section text-ink", className)} {...props} />;
}
