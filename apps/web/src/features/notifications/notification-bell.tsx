import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiJson } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { notificationText } from "./notification-text";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

/** Bell with unread count; opens a 360px popover list (ui-spec §6.1). Clicking an item marks it read. */
export function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiJson<NotificationPage>("/api/v1/notifications?limit=20"),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={unread > 0 ? t("notifications.titleWithCount", { count: unread }) : t("notifications.title")}
        className="relative flex size-10 items-center justify-center rounded-control text-ink-muted hover:bg-canvas hover:text-ink"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute end-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-meta font-medium tabular-nums text-white">
            {unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <p className="border-b border-line px-4 py-3 text-subsection">{t("notifications.title")}</p>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-dense text-ink-muted">{t("notifications.empty")}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                  className={cn(
                    "relative block w-full py-3 pe-4 ps-8 text-start text-dense hover:bg-canvas",
                    !n.readAt && "font-medium",
                  )}
                >
                  {!n.readAt && <span className="absolute start-4 top-[1.15rem] size-2 rounded-full bg-primary" aria-hidden="true" />}
                  {notificationText(t, n).title}
                  {notificationText(t, n).note && (
                    <span className="mt-1 block text-meta font-normal text-ink-muted">
                      {t("notifications.reason", { reason: notificationText(t, n).note })}
                    </span>
                  )}
                  <span className="mt-1 block text-meta font-normal tabular-nums text-ink-muted">
                    <bdi>{formatDateTime(n.createdAt)}</bdi>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
