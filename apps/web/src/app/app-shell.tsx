import { PERMISSIONS } from "@idara-pro/shared";
import { ChevronLeft, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { setLanguage } from "@/i18n";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { useAttention } from "./attention";
import { CrumbProvider, useCrumb } from "./shell/crumb";
import { BottomNav } from "./shell/bottom-nav";
import { MobileDrawer } from "./shell/mobile-drawer";
import { activeItem, visibleGroups } from "./shell/nav-items";
import { Sidebar } from "./shell/sidebar";
import { useMediaQuery } from "./shell/use-media-query";
import { useSidebarCollapsed } from "./shell/use-sidebar-collapsed";
import { UserMenu } from "./shell/user-menu";

/**
 * Layout for the sign-in family (login, accept invitation, forgot/reset password). It never shows the
 * app shell, even if a session happens to exist in this browser: these pages are about *getting* access.
 */
export function PublicLayout(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex h-16 items-center justify-end px-4">
        <button
          type="button"
          onClick={() => setLanguage(i18n.language === "ar" ? "en" : "ar")}
          className="h-10 rounded-control px-3 text-body font-medium text-ink hover:bg-canvas"
          lang={i18n.language === "ar" ? "en" : "ar"}
        >
          {t("shell.language")}
        </button>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center">
        <Outlet />
      </main>
    </div>
  );
}

/** ui-spec §6: sidebar on the inline-start (right in Arabic), 64px top bar, content max 1280. */
function SignedInShell({ userId }: { userId: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can, logout } = useAuth();
  const { pathname } = useLocation();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const wide = useMediaQuery("(min-width: 1280px)");
  const [collapsed, toggleCollapsed] = useSidebarCollapsed(userId, wide);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { employee, hasEmployee } = useMyEmployee();
  const groups = useMemo(() => visibleGroups(can, hasEmployee), [can, hasEmployee]);
  const current = activeItem(groups, pathname);
  const selfService = can(PERMISSIONS.EMPLOYEES_SELF_SERVICE);
  // Queues waiting on this user → a count on each nav item (shared cache with the pages and dashboard).
  const { counts, total } = useAttention();
  const navCounts = useMemo(() => ({ ...counts, total }), [counts, total]);
  // Employees on phones get a bottom tab bar for their everyday screens.
  const bottomNav = !desktop && hasEmployee && selfService;

  // HR admins may have no employee record; only self-service users have a /me profile.
  const name = employee ? (i18n.language === "ar" ? employee.fullNameAr : employee.fullNameEn) : t("shell.account");

  // Drawer closes on navigation and when the viewport grows past the breakpoint.
  useEffect(() => setDrawerOpen(false), [pathname, desktop]);

  return (
    <div className="flex min-h-screen">
      {desktop ? (
        <Sidebar groups={groups} counts={navCounts} collapsed={collapsed} onToggle={toggleCollapsed} />
      ) : (
        <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} groups={groups} counts={navCounts} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:px-8">
          {!desktop && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("shell.openMenu")}
              aria-expanded={drawerOpen}
              className="-ms-2 flex size-10 items-center justify-center rounded-control text-ink hover:bg-canvas"
            >
              <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <TopBarTitle sectionTo={current?.to} sectionLabel={current ? t(current.labelKey) : t("app.name")} nested={Boolean(current && pathname !== current.to)} />
          <div className="flex items-center gap-1">
            {can(PERMISSIONS.NOTIFICATIONS_READ) && <NotificationBell />}
            <UserMenu name={name} showProfile={selfService && hasEmployee} onLogout={() => void logout()} />
          </div>
        </header>
        <main className={bottomNav ? "flex-1 p-4 pb-24" : "flex-1 p-4 lg:p-8"}>
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
        {bottomNav && <BottomNav inboxCount={total} />}
      </div>
    </div>
  );
}

/**
 * Layout for every page behind sign-in. Nothing of the app (sidebar, data) renders until the session
 * *and* its permissions are known; anonymous visitors go to /login and come back here afterwards.
 */
export function ProtectedLayout(): React.JSX.Element {
  const { status, claims } = useAuth();
  const location = useLocation();
  if (status === "loading") return <SessionLoading />;
  if (status === "anonymous" || !claims) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return (
    <CrumbProvider>
      <SignedInShell userId={claims.sub} />
    </CrumbProvider>
  );
}

/**
 * ui-spec §6.1 breadcrumb: on a top-level page the section name; on a nested page (an employee, a payroll
 * month, a form) "section › page" with the section as the way back. The page's own h1 stays the title.
 */
function TopBarTitle({ sectionTo, sectionLabel, nested }: { sectionTo?: string; sectionLabel: string; nested: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const crumb = useCrumb();
  if (!nested || !sectionTo) return <p className="min-w-0 flex-1 truncate text-subsection text-ink">{sectionLabel}</p>;
  return (
    <nav aria-label={t("shell.breadcrumb")} className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-subsection">
        <li className="shrink-0">
          <Link to={sectionTo} className="rounded-control text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            {sectionLabel}
          </Link>
        </li>
        {crumb && (
          <>
            <li aria-hidden="true" className="shrink-0 text-ink-muted">
              <ChevronLeft className="size-4 ltr:rotate-180" strokeWidth={1.75} />
            </li>
            <li className="min-w-0 truncate text-ink" aria-current="page">
              {crumb}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/** Restoring a session takes one round trip; show the product mark, not a flash of the wrong screen. */
function SessionLoading(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface" role="status">
      <span className="flex size-12 animate-pulse items-center justify-center rounded-panel bg-primary text-subsection text-white" aria-hidden="true">
        {t("app.mark")}
      </span>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
