import { cn } from "@/lib/utils";

const sizes = { sm: "size-8 text-meta", md: "size-10 text-dense", lg: "size-[72px] text-section" } as const;

/** First letter of the first and last name (ui-spec §5 Avatar). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary",
        sizes[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
