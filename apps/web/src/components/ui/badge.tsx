import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "pending" | "approved" | "rejected";

const tones: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  pending: "border-warning text-warning",
  approved: "border-primary text-primary",
  rejected: "border-destructive text-destructive",
};

/** The one place colour carries meaning: amber = waiting on HR, teal = done, red = refused. */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }): React.JSX.Element {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
