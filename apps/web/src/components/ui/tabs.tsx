import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/utils";

// ui-spec §5 Tabs: underline style — active = primary text + 2px bar; no pill tabs.
//
// ux-redesign-v2 §1.2 "tabs that never jump":
// - a panel mounts the first time its tab is shown and then stays mounted (hidden), so going back is
//   instant and keeps its scroll and form state; `preload` mounts every panel up front, which also
//   fetches every tab's data as soon as the record opens;
// - the panel area keeps at least a screen of height, so a shorter tab never shortens the page and the
//   browser never pulls the tab bar away from under the pointer.

interface MountState {
  active: string | undefined;
  visited: ReadonlySet<string>;
  preload: boolean;
}

const MountContext = createContext<MountState | null>(null);

type TabsProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
  /** Mount every panel immediately (hidden until chosen) so their data loads with the page. */
  preload?: boolean;
};

export const Tabs = forwardRef<ElementRef<typeof TabsPrimitive.Root>, TabsProps>(
  ({ preload = false, value, defaultValue, onValueChange, ...props }, ref) => {
    const [uncontrolled, setUncontrolled] = useState(defaultValue);
    const active = value ?? uncontrolled;
    // Remembered across renders without causing one: adding the active tab is idempotent.
    const visited = useRef(new Set<string>());
    if (active !== undefined) visited.current.add(active);
    return (
      <MountContext.Provider value={{ active, visited: visited.current, preload }}>
        <TabsPrimitive.Root
          ref={ref}
          value={active}
          onValueChange={(v) => {
            setUncontrolled(v);
            onValueChange?.(v);
          }}
          {...props}
        />
      </MountContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex items-end gap-6 overflow-x-auto border-b border-line", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px whitespace-nowrap border-b-2 border-transparent pb-3 pt-2 text-body font-medium text-ink-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-primary",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, value, ...props }, ref) => {
  const mount = useContext(MountContext);
  const keep = mount !== null && (mount.preload || mount.visited.has(value));
  if (!keep) return <TabsPrimitive.Content ref={ref} value={value} className={cn("pt-6", className)} {...props} />;
  return (
    <TabsPrimitive.Content
      ref={ref}
      value={value}
      forceMount
      hidden={mount.active !== value}
      // 100dvh minus the 64px top bar: the panel area never gets shorter than the screen.
      className={cn("min-h-[calc(100dvh-4rem)] pt-6", className)}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";
