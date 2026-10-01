import { PERMISSIONS } from "@idara-pro/shared";
import { FileStack, Fingerprint, Inbox, LayoutDashboard, UserRound, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/utils";
import { INBOX_PERMISSIONS, REQUEST_PERMISSIONS } from "./nav-items";

interface Tab {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  show: boolean;
  count?: number;
}

/**
 * Phones, for people with an employee record: the four things an employee does, one thumb away —
 * الرئيسية · حضوري · طلباتي · ملفي (plus الواردة for anyone who approves). The menu still has the rest.
 */
export function BottomNav({ inboxCount }: { inboxCount: number }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const tabs: Tab[] = [
    { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, show: true },
    { to: "/my-attendance", labelKey: "nav.myAttendance", icon: Fingerprint, show: can(PERMISSIONS.ATTENDANCE_PUNCH) },
    { to: "/my-requests", labelKey: "nav.myRequests", icon: FileStack, show: REQUEST_PERMISSIONS.some((p) => can(p)) },
    { to: "/inbox", labelKey: "nav.inboxShort", icon: Inbox, show: INBOX_PERMISSIONS.some((p) => can(p)), count: inboxCount },
    { to: "/profile", labelKey: "nav.profileShort", icon: UserRound, show: can(PERMISSIONS.EMPLOYEES_SELF_SERVICE) },
  ];
  return (
    <nav
      aria-label={t("nav.bottom")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <li key={x.to} className="flex-1">
              <NavLink
                to={x.to}
                end={x.to === "/"}
                className={({ isActive }) =>
                  cn("relative flex h-16 flex-col items-center justify-center gap-1 text-meta", isActive ? "font-medium text-primary" : "text-ink-muted")
                }
              >
                <x.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                <span>{t(x.labelKey)}</span>
                {x.count !== undefined && x.count > 0 && (
                  <span className="absolute top-2 ms-6 min-w-5 rounded-full bg-warning px-1 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">
                    {x.count > 99 ? "99+" : x.count}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}
