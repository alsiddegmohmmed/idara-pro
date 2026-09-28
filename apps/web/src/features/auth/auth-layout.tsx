import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * ui-spec §7.7: white page, centred 400px panel with the product mark and name, then the
 * form; a thin footer line below. Shared by login, invitation, forgot and reset password.
 */
export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex w-full max-w-[400px] flex-col items-stretch gap-6">
      <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-subsection text-white"
            aria-hidden="true"
          >
            {t("app.mark")}
          </span>
          <span className="text-subsection text-ink">{t("app.name")}</span>
        </div>
        <h1 className="text-page-title">{title}</h1>
        {intro && <p className="mt-1 text-body text-ink-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="text-center text-meta text-ink-muted">
        <bdi className="tabular-nums">© {new Date().getFullYear()}</bdi> {t("app.name")}
      </p>
    </div>
  );
}
