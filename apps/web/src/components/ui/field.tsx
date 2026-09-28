import { cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Input/Select/Textarea: height 40, white, 1px line-strong, radius 6, 12px inline padding.
// The global :focus-visible outline gives the 2px primary ring with 2px offset.
export const controlClass =
  "w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlClass, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} rows={3} className={cn(controlClass, "py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

/** Native <select> — kept for react-hook-form `register` forms; Radix `Select` lives in ./select. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(controlClass, "h-10", className)} {...props} />,
);
NativeSelect.displayName = "NativeSelect";

/** Label above, control, then helper or error below — so every form reads the same. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}): React.JSX.Element {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  // Tie the helper/error text to the control and flag it invalid (danger border + a11y).
  const control = isValidElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)
    ? cloneElement(children, {
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-meta font-medium text-ink">
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-meta text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
