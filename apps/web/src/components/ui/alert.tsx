import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
} as const;

/** Inline notice inside a form or panel. Errors use role="alert" so they are announced. */
export function Alert({
  tone = "danger",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { tone?: keyof typeof tones }): React.JSX.Element {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-control px-3 py-2 text-meta", tones[tone], className)}
      {...props}
    />
  );
}
