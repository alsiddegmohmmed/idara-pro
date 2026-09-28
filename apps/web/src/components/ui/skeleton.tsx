import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Skeleton: grey blocks matching the layout; no whole-page spinners.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-neutral-soft", className)} {...props} />;
}
