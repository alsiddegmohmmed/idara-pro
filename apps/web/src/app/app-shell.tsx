import { PERMISSIONS } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { setLanguage } from "@/i18n";
import { apiJson } from "@/lib/api";
import type { Employee, ReviewQueue } from "@/lib/types";
import { MobileDrawer } from "./shell/mobile-drawer";
import { activeItem, visibleGroups } from "./shell/nav-items";
import { Sidebar } from "./shell/sidebar";
import { useMediaQuery } from "./shell/use-media-query";
import { useSidebarCollapsed } from "./shell/use-sidebar-collapsed";
import { UserMenu } from "./shell/user-menu";

/** Signed-out pages (login, invitation, password reset): no sidebar, just a language switch. */
function PublicShell(): React.JSX.Element {
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

  const groups = useMemo(() => visibleGroups(can), [can]);
  const current = activeItem(groups, pathname);
  const canReview = can(PERMISSIONS.EMPLOYEES_REVIEW);
  const selfService = can(PERMISSIONS.EMPLOYEES_SELF_SERVICE);

  // Same query key as the review page, so deciding an item there updates the badge here.
  const reviews = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"),
    enabled: canReview,
    refetchInterval: 60_000,
  });
  const reviewCount = reviews.data ? reviews.data.ibans.length + reviews.data.documents.length : 0;

  // HR admins may have no employee record; only self-service users have a /me profile.
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiJson<Employee>("/api/v1/me/profile"), enabled: selfService });
  const name = me.data ? (i18n.language === "ar" ? me.data.fullNameAr : me.data.fullNameEn) : t("shell.account");

  // Drawer closes on navigation and when the viewport grows past the breakpoint.
  useEffect(() => setDrawerOpen(false), [pathname, desktop]);

  return (
    <div className="flex min-h-screen">
      {desktop ? (
        <Sidebar groups={groups} reviewCount={reviewCount} collapsed={collapsed} onToggle={toggleCollapsed} />
      ) : (
        <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} groups={groups} reviewCount={reviewCount} />
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
          <p className="min-w-0 flex-1 truncate text-subsection text-ink">{current ? t(current.labelKey) : t("app.name")}</p>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu name={name} showProfile={selfService} onLogout={() => void logout()} />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell(): React.JSX.Element {
  const { status, claims } = useAuth();
  if (status === "authenticated" && claims) {
    return <SignedInShell userId={claims.sub} />;
  }
  return <PublicShell />;
}
