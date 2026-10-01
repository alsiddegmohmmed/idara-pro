import { useTranslation } from "react-i18next";
import { Navigate, NavLink } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/utils";
import type { SectionTab } from "./nav-items";

/**
 * Link tabs on top of a section made of several pages (الإعدادات = setup · access · audit; الرواتب =
 * runs · adjustments). One nav item, one place; each tab keeps its own URL and permission.
 */
export function SectionTabs({ tabs, children }: { tabs: SectionTab[]; children: React.ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const allowed = tabs.filter((x) => can(x.permission));
  return (
    <>
      {allowed.length > 1 && (
        <nav aria-label={t("nav.sectionTabs")} className="-mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-line">
          {allowed.map((x) => (
            <NavLink
              key={x.to}
              to={x.to}
              className={({ isActive }) =>
                cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-dense font-medium",
                  isActive ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink",
                )
              }
            >
              {t(x.labelKey)}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
    </>
  );
}

/** /settings → the first settings page this user may open. */
export function FirstAllowedTab({ tabs }: { tabs: SectionTab[] }): React.JSX.Element {
  const { can } = useAuth();
  const first = tabs.find((x) => can(x.permission));
  return <Navigate to={first?.to ?? "/"} replace />;
}
