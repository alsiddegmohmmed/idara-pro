import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Deep link "…?new=1" opens a page's "new request" dialog (used by the dashboard's quick actions).
 * The param is removed right away so a refresh or Back doesn't reopen it.
 */
export function useOpenOnNewParam(open: () => void): void {
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    open();
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
    // Runs once per arrival with ?new=1 (deliberately not re-run when `open` or params change).
  }, [wantsNew]);
}
