import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Input } from "./field";

/** Password field with a show/hide toggle at the inline-end (ui-spec §7.7). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, ...props }, ref) => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("pe-11", className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
          aria-pressed={visible}
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-control text-ink-muted hover:text-ink"
        >
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
