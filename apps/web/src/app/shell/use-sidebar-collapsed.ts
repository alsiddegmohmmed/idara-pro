import { useCallback, useState } from "react";

const keyFor = (userId: string): string => `idara.sidebar.collapsed.${userId}`;

function read(userId: string): boolean | null {
  try {
    const value = localStorage.getItem(keyFor(userId));
    return value === null ? null : value === "1";
  } catch {
    return null;
  }
}

/**
 * ui-spec §6.1: the user's own choice persists per user; with no choice yet the default is
 * expanded at ≥1280px and collapsed at 1024–1279px.
 */
export function useSidebarCollapsed(userId: string, wide: boolean): [boolean, () => void] {
  const [stored, setStored] = useState<boolean | null>(() => read(userId));
  const collapsed = stored ?? !wide;
  const toggle = useCallback(() => {
    const next = !collapsed;
    setStored(next);
    try {
      localStorage.setItem(keyFor(userId), next ? "1" : "0");
    } catch {
      // Storage blocked (private mode): the choice lasts for this page view only.
    }
  }, [collapsed, userId]);
  return [collapsed, toggle];
}
