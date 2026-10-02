import type { ReactNode } from "react";

/**
 * ui-spec §7.7: the form column of the sign-in pages (login, invitation, forgot and reset password).
 * PublicLayout supplies the product mark, the language switch and the brand panel beside it.
 */
export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-[28px] font-semibold leading-[42px] text-ink">{title}</h1>
      {intro && <p className="mt-1.5 text-body text-ink-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
