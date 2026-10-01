import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { controlClass } from "./field";

/**
 * One date / range / month picker for the whole app (ui-spec §5 Forms): Arabic month names with Western digits,
 * weeks from Sunday, Friday–Saturday shown as the weekend, quick choices, and a month/year jump for far dates
 * (birth dates). Values are plain "YYYY-MM-DD" / "YYYY-MM" strings, exactly what the API takes.
 */

const pad = (n: number): string => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (iso: string): { y: number; m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso);
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3] ?? 1) } : null;
};
export const todayIso = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const addDaysIso = (iso: string, n: number): string => {
  const p = parse(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.y, p.m, p.d + n));
  return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function useFormats(): { locale: string; day: (iso: string) => string; month: (y: number, m: number) => string; monthShort: (m: number) => string; weekdays: string[] } {
  const { i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  const utc = (y: number, m: number, d = 1): Date => new Date(Date.UTC(y, m, d));
  return {
    locale,
    day: (iso) => {
      const p = parse(iso);
      return p ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(p.y, p.m, p.d)) : "";
    },
    month: (y, m) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(y, m)),
    monthShort: (m) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(utc(2026, m)),
    // 2026-01-04 is a Sunday.
    weekdays: Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(utc(2026, 0, 4 + i))),
  };
}

const triggerClass = cn(controlClass, "flex h-10 items-center gap-2 text-start");

function Popup({ open, onOpenChange, trigger, children }: { open: boolean; onOpenChange: (o: boolean) => void; trigger: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[320px] max-w-[calc(100vw-24px)] rounded-panel border border-line bg-surface p-3 shadow-float outline-none data-[state=open]:animate-fade-in"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Month grid with a month/year jump; `isSelected` / `inRange` decide the highlight. */
function MonthGrid({
  view,
  onView,
  onPick,
  min,
  max,
  isSelected,
  inRange,
}: {
  view: { y: number; m: number };
  onView: (v: { y: number; m: number }) => void;
  onPick: (iso: string) => void;
  min?: string;
  max?: string;
  isSelected: (iso: string) => boolean;
  inRange?: (iso: string) => boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const rtl = i18n.dir() === "rtl";
  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayIso();
  const thisYear = new Date().getFullYear();
  const shift = (n: number): void => {
    const d = new Date(Date.UTC(view.y, view.m + n, 1));
    onView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <button type="button" className="rounded-control p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" aria-label={t("datePicker.prevMonth")} onClick={() => shift(-1)}>
          <Prev className="size-4" />
        </button>
        <select
          aria-label={t("datePicker.month")}
          className="h-8 flex-1 rounded-control border border-line bg-surface px-1 text-dense"
          value={view.m}
          onChange={(e) => onView({ ...view, m: Number(e.target.value) })}
        >
          {Array.from({ length: 12 }, (_, m) => (
            <option key={m} value={m}>
              {f.monthShort(m)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("datePicker.year")}
          className="h-8 w-20 rounded-control border border-line bg-surface px-1 text-dense tabular-nums"
          value={view.y}
          onChange={(e) => onView({ ...view, y: Number(e.target.value) })}
        >
          {Array.from({ length: thisYear + 6 - 1940 }, (_, i) => thisYear + 5 - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className="rounded-control p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" aria-label={t("datePicker.nextMonth")} onClick={() => shift(1)}>
          <Next className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-meta text-ink-muted">
        {f.weekdays.map((w, i) => (
          <span key={w} className={cn("py-1", i >= 5 && "text-ink-muted/70")}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            (() => {
              const iso = isoOf(view.y, view.m, d);
              const disabled = (min !== undefined && iso < min) || (max !== undefined && iso > max);
              const selected = isSelected(iso);
              const weekend = (i % 7) >= 5;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={f.day(iso)}
                  onClick={() => onPick(iso)}
                  className={cn(
                    "mx-auto flex size-9 items-center justify-center rounded-full text-dense tabular-nums transition-colors",
                    selected ? "bg-primary text-white" : inRange?.(iso) ? "bg-primary-soft text-ink" : "hover:bg-canvas",
                    !selected && weekend && "text-ink-muted",
                    !selected && iso === today && "ring-1 ring-primary",
                    disabled && "pointer-events-none opacity-30",
                  )}
                >
                  {d}
                </button>
              );
            })()
          ),
        )}
      </div>
    </div>
  );
}

function Chips({ items }: { items: Array<{ label: string; onClick: () => void }> }): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      {items.map((c) => (
        <button key={c.label} type="button" onClick={c.onClick} className="rounded-full border border-line px-3 py-1 text-meta hover:border-primary hover:text-primary">
          {c.label}
        </button>
      ))}
    </div>
  );
}

const viewOf = (value: string | undefined, fallback: string): { y: number; m: number } => {
  const p = parse(value || fallback) ?? parse(todayIso());
  return { y: p?.y ?? 2026, m: p?.m ?? 0 };
};

export interface DatePickerProps {
  id?: string;
  /** "YYYY-MM-DD" or "" for none. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shows a ✕ to empty an optional date. */
  clearable?: boolean;
  /** For plain <form> submits (FormData): rendered as a hidden input. */
  name?: string;
  /** Quick choices under the calendar; defaults to "today" (+ "tomorrow" when allowed). */
  presets?: Array<{ label: string; value: string }>;
  "aria-invalid"?: boolean;
  className?: string;
}

export function DatePicker({ id, value, onChange, min, max, placeholder, disabled, clearable, name, presets, className, ...rest }: DatePickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const f = useFormats();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => viewOf(value, max && max < todayIso() ? max : todayIso()));
  const today = todayIso();
  const within = (iso: string): boolean => (!min || iso >= min) && (!max || iso <= max);
  const chips = (presets ?? [
    { label: t("datePicker.today"), value: today },
    { label: t("datePicker.tomorrow"), value: addDaysIso(today, 1) },
  ]).filter((p) => within(p.value));
  const pick = (iso: string): void => {
    onChange(iso);
    setOpen(false);
  };
  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <Popup
        open={open}
        onOpenChange={(o) => {
          if (o) setView(viewOf(value, max && max < today ? max : today));
          setOpen(o);
        }}
        trigger={
          <button type="button" id={id} disabled={disabled} aria-invalid={rest["aria-invalid"]} className={cn(triggerClass, clearable && value && "pe-9")}>
            <CalendarDays className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <span className={cn("truncate", !value && "text-ink-muted")}>{value ? f.day(value) : (placeholder ?? t("datePicker.choose"))}</span>
          </button>
        }
      >
        <MonthGrid view={view} onView={setView} onPick={pick} min={min} max={max} isSelected={(iso) => iso === value} />
        {chips.length > 0 && <Chips items={chips.map((c) => ({ label: c.label, onClick: () => pick(c.value) }))} />}
      </Popup>
      {clearable && value && !disabled && (
        <button
          type="button"
          aria-label={t("datePicker.clear")}
          onClick={() => onChange("")}
          className="absolute inset-y-0 end-2 my-auto flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** From–to in one control: first tap = start, second = end. Quick choices for the usual leave ranges. */
export function DateRangePicker({
  id,
  from,
  to,
  onChange,
  min,
  max,
  disabled,
}: {
  id?: string;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const f = useFormats();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => viewOf(from, todayIso()));
  const [anchor, setAnchor] = useState<string | null>(null);
  const today = todayIso();
  // Next week = the coming Sunday to Thursday.
  const daysToSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7 || 7;
  const nextSunday = addDaysIso(today, daysToSunday);
  const within = (iso: string): boolean => (!min || iso >= min) && (!max || iso <= max);
  const chips = [
    { label: t("datePicker.today"), from: today, to: today },
    { label: t("datePicker.tomorrow"), from: addDaysIso(today, 1), to: addDaysIso(today, 1) },
    { label: t("datePicker.nextWeek"), from: nextSunday, to: addDaysIso(nextSunday, 4) },
  ].filter((c) => within(c.from) && within(c.to));
  const set = (range: { from: string; to: string }): void => {
    onChange(range);
    setAnchor(null);
    setOpen(false);
  };
  const label = from ? (from === to || !to ? f.day(from) : `${f.day(from)} ← ${f.day(to)}`) : t("datePicker.chooseRange");
  return (
    <Popup
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setView(viewOf(from, today));
          setAnchor(null);
        }
        setOpen(o);
      }}
      trigger={
        <button type="button" id={id} disabled={disabled} className={triggerClass}>
          <CalendarDays className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className={cn("truncate", !from && "text-ink-muted")}>{label}</span>
        </button>
      }
    >
      <p className="mb-2 text-meta text-ink-muted">{anchor ? t("datePicker.pickEnd") : t("datePicker.pickStart")}</p>
      <MonthGrid
        view={view}
        onView={setView}
        min={anchor ?? min}
        max={max}
        isSelected={(iso) => iso === (anchor ?? from) || (!anchor && iso === to)}
        inRange={(iso) => !anchor && Boolean(from && to) && iso > from && iso < to}
        onPick={(iso) => {
          if (!anchor) {
            setAnchor(iso);
            onChange({ from: iso, to: iso });
          } else set({ from: anchor, to: iso });
        }}
      />
      {chips.length > 0 && <Chips items={chips.map((c) => ({ label: c.label, onClick: () => set({ from: c.from, to: c.to }) }))} />}
    </Popup>
  );
}

/** A month ("YYYY-MM"): year arrows and twelve month buttons. */
export function MonthPicker({ id, value, onChange, min, max, className }: { id?: string; value: string; onChange: (value: string) => void; min?: string; max?: string; className?: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const f = useFormats();
  const [open, setOpen] = useState(false);
  const p = parse(value) ?? parse(todayIso());
  const [year, setYear] = useState(p?.y ?? 2026);
  const rtl = i18n.dir() === "rtl";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const current = todayIso().slice(0, 7);
  return (
    <Popup
      open={open}
      onOpenChange={(o) => {
        if (o) setYear(parse(value)?.y ?? Number(current.slice(0, 4)));
        setOpen(o);
      }}
      trigger={
        <button type="button" id={id} className={cn(triggerClass, "w-auto min-w-44", className)}>
          <CalendarDays className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="truncate">{p ? f.month(p.y, p.m) : t("datePicker.chooseMonth")}</span>
        </button>
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-control p-1.5 text-ink-muted hover:bg-canvas" aria-label={t("datePicker.prevYear")} onClick={() => setYear((y) => y - 1)}>
          <Prev className="size-4" />
        </button>
        <span className="text-dense font-semibold tabular-nums">{year}</span>
        <button type="button" className="rounded-control p-1.5 text-ink-muted hover:bg-canvas" aria-label={t("datePicker.nextYear")} onClick={() => setYear((y) => y + 1)}>
          <Next className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, m) => {
          const iso = `${year}-${pad(m + 1)}`;
          const disabled = (min !== undefined && iso < min) || (max !== undefined && iso > max);
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              aria-pressed={iso === value}
              onClick={() => {
                onChange(iso);
                setOpen(false);
              }}
              className={cn(
                "rounded-control px-2 py-2 text-dense transition-colors",
                iso === value ? "bg-primary text-white" : "hover:bg-canvas",
                iso === current && iso !== value && "ring-1 ring-primary",
                disabled && "pointer-events-none opacity-30",
              )}
            >
              {f.monthShort(m)}
            </button>
          );
        })}
      </div>
      <Chips
        items={[
          {
            label: t("datePicker.thisMonth"),
            onClick: () => {
              onChange(current);
              setOpen(false);
            },
          },
        ]}
      />
    </Popup>
  );
}
