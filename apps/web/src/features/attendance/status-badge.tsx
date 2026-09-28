import { useTranslation } from "react-i18next";
import { Badge, type Tone } from "@/components/ui/badge";
import type { BoardState } from "./api";

const TONES: Record<BoardState, Tone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  leave: "info",
  holiday: "neutral",
  weekend: "neutral",
  not_yet: "neutral",
};

/** Attendance status as word + colour (ui-spec §5 Badge). */
export function AttendanceBadge({ state }: { state: BoardState | null }): React.JSX.Element {
  const { t } = useTranslation();
  const s = state ?? "not_yet";
  return (
    <Badge tone={TONES[s]} dot>
      {t(`attendance.status.${s}`)}
    </Badge>
  );
}
