import { useTranslation } from "react-i18next";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";

// ui-spec §5 Toast: bottom corner on the inline-end side, away from the sidebar —
// bottom-left in Arabic, bottom-right in English.
export function Toaster(): React.JSX.Element {
  const { i18n } = useTranslation();
  const dir = i18n.dir();
  return (
    <Sonner
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      closeButton
      toastOptions={{
        style: {
          fontFamily: "inherit",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          boxShadow: "var(--shadow-float)",
        },
        classNames: {
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
        },
      }}
    />
  );
}

/** Past-tense confirmations auto-dismiss; errors stay until the user dismisses them. */
export const toast = {
  success: (message: string): string | number => sonnerToast.success(message),
  error: (message: string): string | number => sonnerToast.error(message, { duration: Infinity }),
  info: (message: string): string | number => sonnerToast(message),
};
