import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * ux-redesign-v2 §2: "look, decide, move on". On desktop a 560px panel on the inline-end side, over the
 * list (which stays, with the row highlighted); on phones a full screen with a back arrow. The list stays
 * mounted underneath, so closing returns to the same scroll position.
 *
 * The caller owns which item is open (usually `?item=` in the URL), the decision and what comes next.
 * ↑/↓ walk the queue, Esc closes.
 */
export function ReviewPanel({
  open,
  title,
  subtitle,
  position,
  total,
  onPrevious,
  onNext,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 1-based position in the queue; omitted when the item isn't in it (e.g. already decided). */
  position?: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  /** The decision row and the "open in module" link. */
  footer?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      // Typing a reason, or a dialog on top (the reject form), keeps the arrows for itself.
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog][aria-modal=true]")) return;
      if (e.key === "ArrowDown" && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowUp" && onPrevious) {
        e.preventDefault();
        onPrevious();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNext, onPrevious]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          // Clicking another row of the list switches the item; it must not close the panel.
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-40 flex flex-col bg-surface data-[state=open]:animate-fade-in lg:inset-y-0 lg:start-auto lg:top-16 lg:w-[560px] lg:border-s lg:border-line lg:shadow-float"
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 lg:px-4">
            {/* Phones: a back arrow (inline-start). Desktop: the close button sits at the inline-end. */}
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label={t("panel.back")}>
              <ChevronRight className="ltr:rotate-180" />
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={!onPrevious} onClick={onPrevious} aria-keyshortcuts="ArrowUp">
                <ChevronRight className="ltr:rotate-180" aria-hidden />
                {t("panel.previous")}
              </Button>
              <Button variant="ghost" size="sm" disabled={!onNext} onClick={onNext} aria-keyshortcuts="ArrowDown">
                {t("panel.next")}
                <ChevronLeft className="ltr:rotate-180" aria-hidden />
              </Button>
            </div>
            {position !== undefined && total > 0 && (
              <span className="text-meta tabular-nums text-ink-muted">{t("panel.position", { n: position, total })}</span>
            )}
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="ms-auto hidden lg:inline-flex" aria-label={t("common.close")}>
                <X />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
            <DialogPrimitive.Title className="text-section text-ink">{title}</DialogPrimitive.Title>
            {subtitle ? (
              <DialogPrimitive.Description className="mt-1 text-dense text-ink-muted">{subtitle}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{t("panel.description")}</DialogPrimitive.Description>
            )}
            <div className="mt-5 space-y-5">{children}</div>
          </div>

          {footer && <footer className="shrink-0 border-t border-line bg-surface px-4 py-3 lg:px-6">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A titled block inside the panel (balance, history, who else is off …). */
export function PanelSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }): React.JSX.Element {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-dense font-semibold text-ink">{title}</h3>
        {aside && <span className="text-meta text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Label / value pairs in two columns — the request card. */
export function PanelFacts({ items }: { items: Array<{ label: string; value: ReactNode } | false | null | undefined> }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-panel border border-line bg-canvas p-4">
      {items.filter(Boolean).map((item) => {
        const { label, value } = item as { label: string; value: ReactNode };
        return (
          <div key={label} className="min-w-0">
            <dt className="text-meta text-ink-muted">{label}</dt>
            <dd className="mt-0.5 text-dense font-medium text-ink">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
