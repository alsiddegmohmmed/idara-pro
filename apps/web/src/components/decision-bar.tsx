import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * ux-redesign-v2 §1.4: the one way a decision looks, wherever it is taken (inbox, module lists, panels):
 * `[✓ موافقة]` primary, `[✕ رفض]` secondary with danger text. Use another verb only where the act really
 * differs (إصدار الإنذار). Rejecting always goes through the reason dialog; the caller opens it.
 */
export function DecisionBar({
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
  approving = false,
  rejecting = false,
  approveDisabledReason,
}: {
  onApprove?: () => void;
  onReject?: () => void;
  /** Defaults to "موافقة". */
  approveLabel?: string;
  /** Defaults to "رفض". */
  rejectLabel?: string;
  /** Spinner on the approve button (the other button is disabled meanwhile). */
  approving?: boolean;
  rejecting?: boolean;
  /** When set, approve is disabled and this explains why (e.g. a missing attachment). */
  approveDisabledReason?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const busy = approving || rejecting;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {onApprove && (
        <Button
          size="sm"
          icon={<Check />}
          loading={approving}
          disabled={(busy && !approving) || Boolean(approveDisabledReason)}
          title={approveDisabledReason}
          onClick={onApprove}
        >
          {approveLabel ?? t("decision.approve")}
        </Button>
      )}
      {onReject && (
        <Button
          size="sm"
          variant="secondary"
          className="text-danger"
          icon={<X />}
          loading={rejecting}
          disabled={busy && !rejecting}
          onClick={onReject}
        >
          {rejectLabel ?? t("decision.reject")}
        </Button>
      )}
    </div>
  );
}
