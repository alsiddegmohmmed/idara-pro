import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiJson } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { notificationLink } from "./notification-link";
import { notificationText } from "./notification-text";

interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

/** Shared by the bell and the employee dashboard (same query key, one request). */
export function useNotifications(enabled = true): { items: AppNotification[]; unread: number; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiJson<NotificationPage>("/api/v1/notifications?limit=20"),
    refetchInterval: 30_000,
    enabled,
  });
  const items = data?.items ?? [];
  return { items, unread: items.filter((n) => !n.readAt).length, isLoading };
}

/** Marks read and opens the screen the notification is about. */
export function useOpenNotification(onOpened?: () => void): (n: AppNotification) => void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const markRead = useMutation({
    mutationFn: (id: string) => apiJson(`/api/v1/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (n) => {
    if (!n.readAt) markRead.mutate(n.id);
    const to = notificationLink(n);
    if (to) {
      onOpened?.();
      navigate(to);
    }
  };
}

/** One row: unread dot, title, optional reason, time. Used in the popover and on the dashboard. */
export function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const text = notificationText(t, n);
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn("relative block w-full py-3 pe-4 ps-8 text-start text-dense hover:bg-canvas focus-visible:bg-canvas", !n.readAt && "font-medium")}
    >
      {!n.readAt && <span className="absolute start-4 top-[1.15rem] size-2 rounded-full bg-primary" aria-hidden="true" />}
      {!n.readAt && <span className="sr-only">{t("notifications.unread")}: </span>}
      {text.title}
      {text.note && <span className="mt-1 block text-meta font-normal text-ink-muted">{t("notifications.reason", { reason: text.note })}</span>}
      <span className="mt-1 block text-meta font-normal tabular-nums text-ink-muted">
        <bdi dir="ltr">{formatDateTime(n.createdAt)}</bdi>
      </span>
    </button>
  );
}

/** Bell with unread count; opens a 360px popover list (ui-spec §6.1). An item opens its screen and marks itself read. */
export function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { items, unread } = useNotifications();
  const openItem = useOpenNotification(() => setOpen(false));
  // No bulk endpoint: the list is capped at 20, so marking the visible unread ones is a handful of calls.
  const markAll = useMutation({
    mutationFn: () => Promise.all(items.filter((n) => !n.readAt).map((n) => apiJson(`/api/v1/notifications/${n.id}/read`, { method: "POST" }))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unread > 0 ? t("notifications.titleWithCount", { count: unread }) : t("notifications.title")}
        className="relative flex size-10 items-center justify-center rounded-control text-ink-muted hover:bg-canvas hover:text-ink data-[state=open]:bg-canvas data-[state=open]:text-ink"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          // Sits on the corner of the bell, ringed in the bar colour so it never covers the icon.
          <span className="absolute end-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-1 text-[11px] font-semibold leading-none tabular-nums text-white ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-subsection">{t("notifications.title")}</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="rounded-control px-2 py-1 text-meta font-medium text-primary hover:bg-primary-soft disabled:opacity-50"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-dense text-ink-muted">{t("notifications.empty")}</p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] divide-y divide-line overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} onOpen={openItem} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
