import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "./nav-items";

interface SidebarNavProps {
  groups: NavGroup[];
  reviewCount: number;
  collapsed: boolean;
}

function CountBadge({ count, collapsed }: { count: number; collapsed: boolean }): React.JSX.Element | null {
  if (count <= 0) return null;
  // Collapsed: the count becomes a dot on the icon (ui-spec §6.1).
  return collapsed ? (
    <span className="absolute end-3 top-2 size-2 rounded-full bg-warning" aria-hidden="true" />
  ) : (
    <span className="ms-auto rounded-full bg-warning-soft px-2 text-meta font-medium tabular-nums text-warning">{count}</span>
  );
}

function SidebarLink({ item, count, collapsed }: { item: NavItem; count: number; collapsed: boolean }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const label = t(item.labelKey);
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      // NavLink sets aria-current="page" on the active item.
      aria-label={collapsed ? (count > 0 ? `${label} (${count})` : label) : undefined}
      className={({ isActive }) =>
        cn(
          "relative flex h-10 items-center gap-3 rounded-control px-3 text-body text-ink transition-colors hover:bg-canvas",
          collapsed && "justify-center px-0",
          isActive &&
            "bg-primary-soft font-medium text-primary hover:bg-primary-soft before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-primary",
        )
      }
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
      <CountBadge count={count} collapsed={collapsed} />
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      {/* Physical side: the tooltip opens away from the sidebar's edge. */}
      <TooltipContent side={i18n.dir() === "rtl" ? "left" : "right"}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Product mark + name, 64px to line up with the top bar. */
export function SidebarBrand({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-line px-4", collapsed && "justify-center px-0")}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary text-dense font-semibold text-white"
        aria-hidden="true"
      >
        {t("app.mark")}
      </span>
      {!collapsed && <span className="truncate text-subsection text-ink">{t("app.name")}</span>}
    </div>
  );
}

export function SidebarNav({ groups, reviewCount, collapsed }: SidebarNavProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => (
        <Fragment key={group.titleKey ?? index}>
          {index > 0 && <div className="my-3 h-px bg-line" role="separator" />}
          {group.titleKey && !collapsed && <p className="mb-1 px-3 text-meta font-medium text-ink-muted">{t(group.titleKey)}</p>}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} count={item.countsReviews ? reviewCount : 0} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </nav>
  );
}

/** Desktop sidebar: 264px expanded, 72px collapsed, width animates (off under reduced motion). */
export function Sidebar({
  groups,
  reviewCount,
  collapsed,
  onToggle,
}: SidebarNavProps & { onToggle: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  // Chevrons point toward the inline-start when collapsing; mirrored in RTL.
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-e border-line bg-surface transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[264px]",
      )}
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav groups={groups} reviewCount={reviewCount} collapsed={collapsed} />
      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("shell.expand") : undefined}
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-control px-3 text-body text-ink-muted hover:bg-canvas hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          <ToggleIcon className="size-5 shrink-0 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
          {!collapsed && <span>{t("shell.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}
