import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiJson } from "@/lib/api";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

function BellIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7Z" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

/** Toggled panel, not a dialog: lists the caller's own notifications, click marks one read. */
export function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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

  function describeNotification(n: AppNotification): string {
    return t(n.titleKey, { defaultValue: n.type, ...n.bodyParams });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("notifications.title")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-control p-2 hover:bg-canvas"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 z-10 mt-2 w-80 rounded-panel border border-line bg-surface shadow-float">
          <p className="border-b border-line px-4 py-2 text-dense font-semibold">{t("notifications.title")}</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-dense text-ink-muted">{t("notifications.empty")}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.readAt && markRead.mutate(n.id)}
                    className={cn("block w-full px-4 py-3 text-start text-dense hover:bg-canvas", !n.readAt && "font-medium")}
                  >
                    {describeNotification(n)}
                    {typeof n.bodyParams.reason === "string" && n.bodyParams.reason && (
                      <span className="mt-1 block text-meta font-normal text-ink-muted">
                        {t("notifications.reason", { reason: n.bodyParams.reason })}
                      </span>
                    )}
                    <span className="mt-1 block text-meta font-normal text-ink-muted">
                      {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
