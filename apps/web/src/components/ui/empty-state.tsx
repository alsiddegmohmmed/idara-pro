import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** ui-spec §5: one line of what's missing + the primary action. No illustrations. */
export function EmptyState({ message, action, className }: { message: string; action?: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-12 text-center", className)}>
      <p className="text-body text-ink-muted">{message}</p>
      {action}
    </div>
  );
}
