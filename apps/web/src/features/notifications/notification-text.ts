import type { TFunction } from "i18next";
import { formatHalalas } from "@/lib/money";
import type { AppNotification } from "@/lib/types";

/** Renders a notification in the viewer's language from its titleKey + params (ADR-0006). */
export function notificationText(t: TFunction, n: AppNotification): { title: string; note: string | null } {
  const params: Record<string, unknown> = { ...n.bodyParams };
  if (typeof params.amountHalalas === "string") params.amount = formatHalalas(params.amountHalalas);
  if (typeof params.warningType === "string") params.warningLabel = t(`discipline.types.${params.warningType}`);
  if (typeof params.kind === "string" && n.type.startsWith("adjustment_")) params.kindLabel = t(`adjustments.kinds.${params.kind}`);
  const note = [params.reason, params.note].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  return { title: t(n.titleKey, { defaultValue: n.type, ...params }), note };
}
