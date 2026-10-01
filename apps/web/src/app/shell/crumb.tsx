import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * The last breadcrumb segment for nested pages (an employee's name, a payroll month, "إضافة موظف").
 * The top bar shows "section › crumb" with the section as a link back; top-level pages set nothing.
 */
const CrumbContext = createContext<(label: string | null) => void>(() => undefined);
const CrumbValue = createContext<string | null>(null);

export function CrumbProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [crumb, setCrumb] = useState<string | null>(null);
  return (
    <CrumbContext.Provider value={setCrumb}>
      <CrumbValue.Provider value={crumb}>{children}</CrumbValue.Provider>
    </CrumbContext.Provider>
  );
}

/** Call from a nested page with its title; cleared when the page unmounts. */
export function usePageCrumb(label: string | null | undefined): void {
  const set = useContext(CrumbContext);
  useEffect(() => {
    set(label ?? null);
    return () => set(null);
  }, [label, set]);
}

export function useCrumb(): string | null {
  return useContext(CrumbValue);
}
