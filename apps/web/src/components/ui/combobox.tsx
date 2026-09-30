import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text matched by the search but not shown (other-language name, code). */
  keywords?: string;
  /** Options sharing a group are listed under its heading, in the given order. */
  group?: string;
}

/** Lower-case, strip Arabic diacritics/tatweel and unify alef/yaa/taa-marbuta forms so "السعوديه" finds "السعودية". */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Shows a "clear" choice at the top when the field is optional. */
  clearable?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Searchable single-choice list (ui-spec §5 Select, long lists): type to filter, arrows to move, Enter to pick,
 * Esc to close. Works with Field (id / aria props land on the trigger button).
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  { id, value, onChange, options, placeholder, searchPlaceholder, emptyText, clearable, disabled, ...aria },
  ref,
) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const matches = q ? options.filter((o) => normalizeSearch(`${o.label} ${o.keywords ?? ""}`).includes(q)) : options;
    return clearable && !q ? [{ value: "", label: t("common.none") }, ...matches] : matches;
  }, [options, query, clearable, t]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };
  const move = (delta: number) => {
    setActive((i) => {
      const next = Math.min(Math.max(i + delta, 0), filtered.length - 1);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[active];
      if (option) pick(option.value);
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setQuery("");
        setActive(Math.max(filtered.findIndex((o) => o.value === value), 0));
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          ref={ref}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          {...aria}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 text-start text-body",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60",
            "aria-[invalid=true]:border-danger",
          )}
        >
          <span className={cn("truncate", !selected && "text-ink-muted")}>{selected?.label ?? (value || placeholder || t("common.choose"))}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-panel border border-line bg-surface p-2 shadow-float outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? t("common.search")}
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="h-10 w-full rounded-control border border-line-strong bg-surface ps-9 pe-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-2 text-dense text-ink-muted">{emptyText ?? t("common.noMatches")}</li>}
            {filtered.map((o, i) => {
              const heading = o.group && o.group !== filtered[i - 1]?.group ? o.group : null;
              return (
                <li key={`${o.group ?? ""}-${o.value}`} role="presentation">
                  {heading && <div className="px-3 pb-1 pt-2 text-meta font-semibold text-ink-muted">{heading}</div>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o.value)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-2 text-body",
                      i === active && "bg-canvas",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === value && <Check className="size-4 shrink-0 text-[var(--primary)]" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
