import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Button: 40 default, 32 in tables, 48 mobile primary.
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-canvas",
        danger: "bg-danger-solid text-white hover:bg-danger",
      },
      size: {
        default: "h-10 px-4 text-body",
        sm: "h-8 px-3 text-dense [&_svg]:size-4",
        lg: "h-12 px-5 text-body",
        icon: "size-10",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router Link) with button styles. */
  asChild?: boolean;
  /** Spinner replaces the icon, the label stays, the button is disabled. */
  loading?: boolean;
  /** Optional icon at the inline-start. */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, icon, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const leading = loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon;
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        // Default to type="button" so a stray button never submits a form by accident.
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      >
        {leading}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  },
);
Button.displayName = "Button";
