import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Radix primitives do not read <html dir>; they default to LTR unless told otherwise.
 * One provider keeps every Tabs/Select/Menu (keyboard arrows included) in the active
 * language's direction.
 */
export function DirectionRoot({ children }: { children: ReactNode }): React.JSX.Element {
  const { i18n } = useTranslation();
  return <DirectionProvider dir={i18n.dir()}>{children}</DirectionProvider>;
}
