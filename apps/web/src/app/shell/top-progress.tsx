import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Only waits the user can see count: a query on screen with nothing to show yet (first load, new filter
 * or month) — not a hover prefetch, which has no observer.
 */
const waitingForData = {
  predicate: (q: { state: { data: unknown }; getObserversCount: () => number }) => q.state.data === undefined && q.getObserversCount() > 0,
};

/**
 * ux-redesign-v2 §1.3: a 2px petrol bar across the top while page data loads for more than 300 ms.
 * Instant pages show nothing; slow ones never look frozen. Quiet background refreshes don't show it.
 */
export function TopProgress(): React.JSX.Element | null {
  const { t } = useTranslation();
  const fetching = useIsFetching(waitingForData) > 0;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!fetching) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), 300);
    return () => window.clearTimeout(timer);
  }, [fetching]);

  if (!shown) return null;
  return (
    <div role="progressbar" aria-label={t("common.loading")} className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary-soft">
      <div className="h-full w-1/3 animate-progress bg-primary rtl:animate-progress-rtl" />
    </div>
  );
}
