import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth";
import { useEmployees } from "@/features/employees/api";
import { nameIn } from "@/features/employees/employee-name";
import { normalizeDigits, PERMISSIONS } from "@idara-pro/shared";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav-items";

// ux-redesign-v2 §8: find a person (name, employee number, national ID / iqama) or a page from anywhere,
// with Ctrl/⌘+K. Employees come from the directory the user may already read (same cached list).

interface Result {
  key: string;
  to: string;
  title: string;
  meta?: string;
  avatar?: string;
}

const MAX_PEOPLE = 8;

/** Lower-case, Latin digits, no Arabic diacritics or tatweel, alef/yaa/taa-marbuta folded — "محمّد" finds "محمد". */
function fold(text: string): string {
  return normalizeDigits(text)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function PeopleSearch({ groups }: { groups: NavGroup[] }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const canPeople = can(PERMISSIONS.EMPLOYEES_READ);
  const employees = useEmployees(open && canPeople);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    const pages: Result[] = groups
      .flatMap((g) => g.items)
      .filter((item) => !q || fold(t(item.labelKey)).includes(q))
      .map((item) => ({ key: `page-${item.to}`, to: item.to, title: t(item.labelKey), meta: t("search.page") }));
    if (!q) return pages.slice(0, 6);
    const people: Result[] = (employees.data ?? [])
      .filter((e) => {
        // A masked ID ("••••1234") is not searchable beyond what is shown.
        const id = e.nationalId.includes("•") ? "" : e.nationalId;
        return [e.fullNameAr, e.fullNameEn, e.employeeNo, id].some((v) => v && fold(v).includes(q));
      })
      .slice(0, MAX_PEOPLE)
      .map((e) => ({
        key: `emp-${e.id}`,
        to: `/employees/${e.id}`,
        title: nameIn(i18n, e),
        meta: [e.employeeNo, e.jobTitle].filter(Boolean).join(" · "),
        avatar: e.fullNameAr,
      }));
    return [...people, ...pages.slice(0, 4)];
  }, [query, groups, employees.data, i18n, t]);

  useEffect(() => setActive(0), [query]);

  const go = (r: Result | undefined): void => {
    if (!r) return;
    setOpen(false);
    setQuery("");
    navigate(r.to);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.open")}
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-10 items-center gap-2 rounded-control px-2.5 text-ink-muted hover:bg-canvas hover:text-ink lg:min-w-56 lg:border lg:border-line lg:px-3"
      >
        <Search className="size-5" strokeWidth={1.75} aria-hidden />
        <span className="hidden flex-1 text-start text-dense lg:inline">{canPeople ? t("search.placeholder") : t("search.pagesOnly")}</span>
        <kbd className="hidden rounded border border-line px-1.5 text-meta text-ink-muted lg:inline" dir="ltr">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-[560px] overflow-hidden rounded-panel border border-line bg-surface shadow-float data-[state=open]:animate-pop-in">
            <DialogPrimitive.Title className="sr-only">{t("search.open")}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{t("search.hint")}</DialogPrimitive.Description>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    go(results[active]);
                  }
                }}
                placeholder={canPeople ? t("search.placeholder") : t("search.pagesOnly")}
                role="combobox"
                aria-expanded
                aria-controls="search-results"
                aria-activedescendant={results[active] ? `search-${results[active].key}` : undefined}
                className="h-14 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
            <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-dense text-ink-muted">{employees.isLoading ? t("common.loading") : t("search.none")}</li>
              ) : (
                results.map((r, i) => (
                  <li
                    key={r.key}
                    id={`search-${r.key}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-control px-3 py-2", i === active && "bg-primary-soft")}
                  >
                    {r.avatar ? (
                      <Avatar name={r.avatar} size="sm" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full bg-canvas text-ink-muted" aria-hidden>
                        <Search className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-dense font-medium text-ink">{r.title}</span>
                      {r.meta && (
                        <span className="block truncate text-meta text-ink-muted">
                          <bdi>{r.meta}</bdi>
                        </span>
                      )}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
