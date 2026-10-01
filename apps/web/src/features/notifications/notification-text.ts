import type { TFunction } from "i18next";
import { formatDateRange, ltr } from "@/lib/dates";
import { formatHalalas } from "@/lib/money";
import type { AppNotification } from "@/lib/types";

const LTR_PARAMS = ["date", "startDate", "endDate", "workDate", "fromTime", "toTime", "period"] as const;

/** Renders a notification in the viewer's language from its titleKey + params (ADR-0006). */
export function notificationText(t: TFunction, n: AppNotification): { title: string; note: string | null } {
  const params: Record<string, unknown> = { ...n.bodyParams };
  if (typeof params.amountHalalas === "string") params.amount = ltr(formatHalalas(params.amountHalalas));
  // Dates, times and months are LTR runs: isolate them or Arabic text reorders "2026-09-28" into "28-09-2026".
  // Ranges are built whole and isolated once, so the arrow keeps pointing from start to end in Arabic.
  if (typeof params.startDate === "string" && typeof params.endDate === "string") params.range = ltr(formatDateRange(params.startDate, params.endDate));
  if (typeof params.fromTime === "string" && typeof params.toTime === "string") params.timeRange = ltr(`${params.fromTime}–${params.toTime}`);
  for (const key of LTR_PARAMS) if (typeof params[key] === "string") params[key] = ltr(params[key] as string);
  if (typeof params.warningType === "string") params.warningLabel = t(`discipline.types.${params.warningType}`);
  if (typeof params.kind === "string" && n.type.startsWith("adjustment_")) params.kindLabel = t(`adjustments.kinds.${params.kind}`);
  const note = [params.reason, params.note].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  return { title: t(n.titleKey, { defaultValue: n.type, ...params }), note };
}
