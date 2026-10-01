import { PERMISSIONS } from "@idara-pro/shared";
import type { AttentionKey } from "../attention";
import { AlarmClock, Banknote, CalendarDays, Clock, FileStack, FileText, FileWarning, Fingerprint, Inbox, LayoutDashboard, Receipt, Settings, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Omitted = everyone signed in; a list = any one of them. */
  permission?: string | string[];
  /** Hidden when the user has this permission (a better item covers it for them). */
  hideIf?: string;
  /** Shows how many items wait on the user (app/attention.ts); "total" = all queues. */
  attention?: AttentionKey | "total";
  /** Only for accounts linked to an employee record (a "my …" screen). */
  requiresEmployee?: boolean;
  /** Other paths that belong to this item (its section tabs), so it stays highlighted there. */
  also?: string[];
}

export interface NavGroup {
  /** Omitted = no group title (the top item). */
  titleKey?: string;
  items: NavItem[];
}

/** Anyone who decides something sees the inbox. */
export const INBOX_PERMISSIONS = [
  PERMISSIONS.EMPLOYEES_REVIEW,
  PERMISSIONS.LEAVE_APPROVE,
  PERMISSIONS.SHORTLEAVE_APPROVE,
  PERMISSIONS.CUSTODY_APPROVE,
  PERMISSIONS.CUSTODY_PAY,
  PERMISSIONS.CUSTODY_SETTLE,
  PERMISSIONS.WARNINGS_ISSUE,
  PERMISSIONS.ADJUSTMENTS_APPROVE,
  PERMISSIONS.PAYROLL_APPROVE,
];

export const REQUEST_PERMISSIONS = [PERMISSIONS.LEAVE_REQUEST, PERMISSIONS.SHORTLEAVE_REQUEST, PERMISSIONS.CUSTODY_REQUEST];

/** Sections made of several pages, shown as tabs on top of each (router.tsx). */
export interface SectionTab {
  to: string;
  labelKey: string;
  permission: string;
}
export const SETTINGS_TABS: SectionTab[] = [
  { to: "/setup", labelKey: "nav.setup", permission: PERMISSIONS.ORG_READ },
  { to: "/access", labelKey: "nav.access", permission: PERMISSIONS.ACCESS_READ },
  { to: "/audit", labelKey: "nav.audit", permission: PERMISSIONS.AUDIT_READ },
];
export const PAYROLL_TABS: SectionTab[] = [
  { to: "/payroll", labelKey: "nav.payrollRuns", permission: PERMISSIONS.PAYROLL_READ },
  { to: "/adjustments", labelKey: "nav.adjustments", permission: PERMISSIONS.ADJUSTMENTS_READ },
];

// ui-spec §6.2, by role: people who decide get the inbox first; employees get "my …" screens only
// (their requests live in طلباتي, not in the module pages). Modules not built yet are not listed.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/inbox", labelKey: "nav.inbox", icon: Inbox, permission: INBOX_PERMISSIONS, attention: "total" },
    ],
  },
  {
    titleKey: "nav.groupHr",
    items: [
      { to: "/employees", labelKey: "nav.employees", icon: Users, permission: PERMISSIONS.EMPLOYEES_READ, also: ["/review-queue"] },
      { to: "/attendance", labelKey: "nav.attendance", icon: Clock, permission: PERMISSIONS.ATTENDANCE_READ },
      { to: "/leave", labelKey: "nav.leave", icon: CalendarDays, permission: [PERMISSIONS.LEAVE_READ, PERMISSIONS.LEAVE_APPROVE] },
      { to: "/short-permissions", labelKey: "nav.shortPermissions", icon: AlarmClock, permission: PERMISSIONS.SHORTLEAVE_READ },
      { to: "/custody", labelKey: "nav.custody", icon: Wallet, permission: PERMISSIONS.CUSTODY_READ },
      { to: "/discipline", labelKey: "nav.warnings", icon: FileWarning, permission: PERMISSIONS.WARNINGS_READ },
      { to: "/payroll", labelKey: "nav.payroll", icon: Banknote, permission: PERMISSIONS.PAYROLL_READ, also: ["/adjustments"] },
      // Only for people who see adjustments but not payroll (for the rest it is a tab of الرواتب).
      { to: "/adjustments", labelKey: "nav.adjustments", icon: Receipt, permission: PERMISSIONS.ADJUSTMENTS_READ, hideIf: PERMISSIONS.PAYROLL_READ },
    ],
  },
  {
    titleKey: "nav.groupAdmin",
    items: [
      {
        to: "/settings",
        labelKey: "nav.settings",
        icon: Settings,
        permission: SETTINGS_TABS.map((x) => x.permission),
        also: SETTINGS_TABS.map((x) => x.to),
      },
    ],
  },
  {
    titleKey: "nav.groupAccount",
    items: [
      { to: "/my-requests", labelKey: "nav.myRequests", icon: FileStack, permission: REQUEST_PERMISSIONS, requiresEmployee: true },
      { to: "/my-attendance", labelKey: "nav.myAttendance", icon: Fingerprint, permission: PERMISSIONS.ATTENDANCE_PUNCH, requiresEmployee: true },
      { to: "/payslips", labelKey: "nav.myPayslips", icon: FileText, permission: PERMISSIONS.EMPLOYEES_SELF_SERVICE, requiresEmployee: true },
      { to: "/profile", labelKey: "nav.myProfile", icon: UserRound, permission: PERMISSIONS.EMPLOYEES_SELF_SERVICE, requiresEmployee: true },
    ],
  },
];

/** The groups this user can see, empty groups dropped. UI hiding only — the API enforces. */
export function visibleGroups(can: (permission: string) => boolean, hasEmployee: boolean): NavGroup[] {
  const allowed = (p: NavItem["permission"]): boolean => !p || (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed(i.permission) && !(i.hideIf && can(i.hideIf)) && (!i.requiresEmployee || hasEmployee)),
  })).filter(
    (g) => g.items.length > 0,
  );
}

/** Longest matching nav item for the current path (for the top-bar title). */
export function activeItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  return groups
    .flatMap((g) => g.items)
    .filter((i) => (i.to === "/" ? pathname === "/" : [i.to, ...(i.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`))))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
