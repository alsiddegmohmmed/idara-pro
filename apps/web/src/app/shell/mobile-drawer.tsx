import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NavGroup } from "./nav-items";
import { SidebarBrand, SidebarNav } from "./sidebar";

/** <1024px: the sidebar as an off-canvas drawer. Radix gives focus trap, Esc and overlay click. */
export function MobileDrawer({
  open,
  onOpenChange,
  groups,
  reviewCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  reviewCount: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 start-0 z-50 flex w-[264px] max-w-[85vw] flex-col border-e border-line bg-surface shadow-float data-[state=open]:animate-fade-in"
        >
          <DialogPrimitive.Title className="sr-only">{t("nav.main")}</DialogPrimitive.Title>
          <SidebarBrand collapsed={false} />
          <SidebarNav groups={groups} reviewCount={reviewCount} collapsed={false} />
          <DialogPrimitive.Close className="absolute end-3 top-4 rounded-control p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">{t("shell.closeMenu")}</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
