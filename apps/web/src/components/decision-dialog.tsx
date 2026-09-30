import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

/** Confirm a decision with an optional (or required) note — approve / reject / rescind. */
export function DecisionDialog({
  title,
  description,
  confirmLabel,
  danger,
  noteRequired,
  noteLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  noteRequired?: boolean;
  noteLabel?: string;
  pending: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const tooShort = noteRequired && note.trim().length < 3;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Field label={noteLabel ?? t("decision.note")} htmlFor="decision-note" required={noteRequired} hint={noteRequired ? undefined : t("decision.optional")}>
          <Textarea id="decision-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button variant={danger ? "danger" : "primary"} loading={pending} disabled={tooShort} onClick={() => onConfirm(note.trim())}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
