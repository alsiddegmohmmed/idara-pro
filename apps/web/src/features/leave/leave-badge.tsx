import { useTranslation } from "react-i18next";
import { Badge, type Tone } from "@/components/ui/badge";
import type { LeaveStatus } from "./api";

const TONES: Record<LeaveStatus, Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };

export function LeaveBadge({ status }: { status: LeaveStatus }): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge tone={TONES[status]}>{t(`leave.status.${status}`)}</Badge>;
}

/** The leave type's name in the viewer's language. */
export function useTypeName(): (type: { nameAr: string; nameEn: string }) => string {
  const { i18n } = useTranslation();
  return (type) => (i18n.language === "ar" ? type.nameAr : type.nameEn);
}
