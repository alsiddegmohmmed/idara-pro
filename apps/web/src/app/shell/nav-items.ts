import { PERMISSIONS } from "@idara-pro/shared";
import { CalendarDays, ClipboardCheck, Clock, Fingerprint, LayoutDashboard, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Omitted = everyone signed in; a list = any one of them. */
  permission?: string | string[];
  /** Shows the pending review count. */
  countsReviews?: boolean;
  /** Only for accounts linked to an employee record (a "my …" screen). */
  requiresEmployee?: boolean;
}

export interface NavGroup {
  /** Omitted = no group title (the top item). */
  titleKey?: string;
  items: NavItem[];
}

// ui-spec §6.2. Modules not built yet are not listed at all (no "coming soon").
// الأقسام والفروع joins the HR group once its settings page exists.
export const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard }] },
  {
    titleKey: "nav.groupHr",
    items: [
      { to: "/employees", labelKey: "nav.employees", icon: Users, permission: PERMISSIONS.EMPLOYEES_READ },
      {
        to: "/review-queue",
        labelKey: "nav.reviewQueue",
        icon: ClipboardCheck,
        permission: PERMISSIONS.EMPLOYEES_REVIEW,
        countsReviews: true,
      },
      { to: "/attendance", labelKey: "nav.attendance", icon: Clock, permission: PERMISSIONS.ATTENDANCE_READ },
    ],
  },
  {
    titleKey: "nav.groupRequests",
    items: [
      {
        to: "/leave",
        labelKey: "nav.leave",
        icon: CalendarDays,
        permission: [PERMISSIONS.LEAVE_REQUEST, PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_APPROVE],
      },
      { to: "/custody", labelKey: "nav.custody", icon: Wallet, permission: [PERMISSIONS.CUSTODY_REQUEST, PERMISSIONS.CUSTODY_READ] },
    ],
  },
  {
    titleKey: "nav.groupAccount",
    items: [
      { to: "/my-attendance", labelKey: "nav.myAttendance", icon: Fingerprint, permission: PERMISSIONS.ATTENDANCE_PUNCH, requiresEmployee: true },
      { to: "/profile", labelKey: "nav.myProfile", icon: UserRound, permission: PERMISSIONS.EMPLOYEES_SELF_SERVICE, requiresEmployee: true },
    ],
  },
];

/** The groups this user can see, empty groups dropped. UI hiding only — the API enforces. */
export function visibleGroups(can: (permission: string) => boolean, hasEmployee: boolean): NavGroup[] {
  const allowed = (p: NavItem["permission"]): boolean => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.permission) && (!i.requiresEmployee || hasEmployee)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Longest matching nav item for the current path (for the top-bar title). */
export function activeItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  return groups
    .flatMap((g) => g.items)
    .filter((i) => (i.to === "/" ? pathname === "/" : pathname === i.to || pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
