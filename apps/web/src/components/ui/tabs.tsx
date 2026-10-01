import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
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
// - the panel area keeps the height of the tallest panel shown so far, so a shorter (or still loading)
//   tab never shortens the page and the browser never pulls the tab bar away from under the pointer.

interface MountState {
  active: string | undefined;
  visited: ReadonlySet<string>;
  preload: boolean;
  /** Height (px) the active panel keeps at least: the tallest panel measured so far. */
  reserve: number;
  measured: (height: number) => void;
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
    const [reserve, setReserve] = useState(0);
    const measured = useCallback((height: number) => setReserve((h) => Math.max(h, Math.round(height))), []);
    return (
      <MountContext.Provider value={{ active, visited: visited.current, preload, reserve, measured }}>
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
>(({ className, value, style, ...props }, ref) => {
  const mount = useContext(MountContext);
  const keep = mount !== null && (mount.preload || mount.visited.has(value));
  const active = mount?.active === value;
  const inner = useRef<HTMLDivElement | null>(null);
  const measured = mount?.measured;

  // Watch the content while it is shown and record the panel's full height (padding included). The panel
  // is never shorter than the reserve, so this only grows to the tallest real panel and then stops.
  useEffect(() => {
    const node = inner.current;
    if (!active || !node || !measured) return;
    const observer = new ResizeObserver(() => measured((node.parentElement ?? node).getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, keep, measured]);

  if (!mount || !keep) return <TabsPrimitive.Content ref={ref} value={value} className={cn("pt-6", className)} style={style} {...props} />;
  const { children, ...rest } = props;
  return (
    <TabsPrimitive.Content
      ref={ref}
      value={value}
      forceMount
      hidden={!active}
      className={cn("pt-6", className)}
      style={{ ...style, minHeight: mount.reserve || undefined }}
      {...rest}
    >
      <div ref={inner} className="flow-root">
        {children}
      </div>
    </TabsPrimitive.Content>
  );
});
TabsContent.displayName = "TabsContent";
