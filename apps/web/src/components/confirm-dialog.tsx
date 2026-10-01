import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * ui-spec §5 Dialog: a short confirmation that names the thing ("إلغاء طلب الاستئذان يوم 2026-10-01؟").
 * The confirm button repeats the action verb; "back" keeps things as they are.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && <Alert>{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{cancelLabel ?? t("common.back")}</Button>
          </DialogClose>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
