import { ShieldOff, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function StatusPage({ icon: Icon, title, body }: { icon: typeof ShieldOff; title: string; body: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-panel bg-neutral-soft text-ink-muted" aria-hidden="true">
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
      <h1 className="text-page-title">{title}</h1>
      <p className="text-body text-ink-muted">{body}</p>
      <Button asChild>
        <Link to="/">{t("status.backHome")}</Link>
      </Button>
    </div>
  );
}

/** Shown when a signed-in user opens a page their role doesn't include (instead of a silent redirect). */
export function ForbiddenPage(): React.JSX.Element {
  const { t } = useTranslation();
  return <StatusPage icon={ShieldOff} title={t("status.forbiddenTitle")} body={t("status.forbiddenBody")} />;
}

export function NotFoundPage(): React.JSX.Element {
  const { t } = useTranslation();
  return <StatusPage icon={SearchX} title={t("status.notFoundTitle")} body={t("status.notFoundBody")} />;
}
