import { ChevronDown, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Role = "admin" | "executive" | "hr_admin" | "branch_hr" | "accountant" | "manager" | "team_lead" | "employee";

export interface Account {
  name: string;
  role: Role;
  identifier: string;
  password: string;
}

const DEMO_PASSWORD = "Demo@12345";

/** The accounts created by `pnpm db:seed:demo` (apps/api/prisma/seed-demo.ts) plus the seeded system admin. */
export const DEMO_ACCOUNTS: Account[] = [
  { name: "مدير النظام", role: "admin", identifier: "admin@idara.local", password: "Admin@12345" },
  { name: "عبدالله محمد العتيبي", role: "executive", identifier: "1725401937", password: DEMO_PASSWORD },
  { name: "نورة سعد القحطاني", role: "hr_admin", identifier: "1417497372", password: DEMO_PASSWORD },
  { name: "ريم خالد الشهري", role: "branch_hr", identifier: "1675455391", password: DEMO_PASSWORD },
  { name: "محمد أحمد عبدالرحمن", role: "accountant", identifier: "2233060312", password: DEMO_PASSWORD },
  { name: "فهد عبدالعزيز الدوسري", role: "manager", identifier: "1986131477", password: DEMO_PASSWORD },
  { name: "سلطان ناصر الحربي", role: "team_lead", identifier: "1904121488", password: DEMO_PASSWORD },
  { name: "أحمد عثمان الطيب", role: "team_lead", identifier: "2916530862", password: DEMO_PASSWORD },
  { name: "هيفاء علي الزهراني", role: "team_lead", identifier: "1664899718", password: DEMO_PASSWORD },
  { name: "راجيش كومار", role: "team_lead", identifier: "2614868581", password: DEMO_PASSWORD },
  { name: "خالد سعيد الغامدي", role: "employee", identifier: "1821728825", password: DEMO_PASSWORD },
  { name: "يوسف إبراهيم المالكي", role: "employee", identifier: "1988693952", password: DEMO_PASSWORD },
  { name: "عمر حسن البنا", role: "employee", identifier: "2793629443", password: DEMO_PASSWORD },
  { name: "سارة عبدالله السبيعي", role: "employee", identifier: "1791333365", password: DEMO_PASSWORD },
  { name: "محمد إقبال", role: "employee", identifier: "2139540910", password: DEMO_PASSWORD },
  { name: "عصام الدين يوسف", role: "employee", identifier: "2872623610", password: DEMO_PASSWORD },
  { name: "مارك أنتوني ريس", role: "employee", identifier: "2713946485", password: DEMO_PASSWORD },
  { name: "سعيد عبده الحمادي", role: "employee", identifier: "2981517326", password: DEMO_PASSWORD },
  { name: "تركي فيصل العنزي", role: "employee", identifier: "1755435323", password: DEMO_PASSWORD },
  { name: "أنيل شارما", role: "employee", identifier: "2635929071", password: DEMO_PASSWORD },
  { name: "بلال أحمد خان", role: "employee", identifier: "2545406234", password: DEMO_PASSWORD },
  { name: "منى عبدالرحمن العمري", role: "employee", identifier: "1693605792", password: DEMO_PASSWORD },
  { name: "لمى ماجد الرشيد", role: "employee", identifier: "1923494923", password: DEMO_PASSWORD },
  { name: "دينا مصطفى كامل", role: "employee", identifier: "2518670725", password: DEMO_PASSWORD },
  { name: "عبدالرحمن صالح اليامي", role: "employee", identifier: "1523161923", password: DEMO_PASSWORD },
  { name: "أسماء حسين الجعفري", role: "employee", identifier: "1336651301", password: DEMO_PASSWORD },
  { name: "جوري فهد المطيري", role: "employee", identifier: "1943773818", password: DEMO_PASSWORD },
  { name: "أحمد محمود السيد", role: "employee", identifier: "2162375736", password: DEMO_PASSWORD },
  { name: "مازن عمر باعشن", role: "employee", identifier: "1462796878", password: DEMO_PASSWORD },
];

const ROLE_ORDER: Role[] = ["admin", "executive", "hr_admin", "branch_hr", "accountant", "manager", "team_lead", "employee"];
/** One account per role for the tiles: the first listed. */
const FEATURED = ROLE_ORDER.map((role) => DEMO_ACCOUNTS.find((a) => a.role === role)).filter((a): a is Account => a !== undefined);

/**
 * Test accounts under the login form (kept on purpose so the team can try every role): one tile per role,
 * and every account behind "كل الحسابات". Choosing one signs in with it straight away.
 */
export function DemoAccounts({ onPick, pending }: { onPick: (account: Account) => void; pending: string | null }): React.JSX.Element {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const role = (a: Account): string => t(`auth.demo.roles.${a.role}`);
  const shown = q ? DEMO_ACCOUNTS.filter((a) => `${a.name} ${a.identifier} ${role(a)}`.toLowerCase().includes(q)) : DEMO_ACCOUNTS;
  const busy = (a: Account): boolean => pending === a.identifier;
  return (
    <section className="mt-8" aria-labelledby="demo-accounts-title">
      <div className="flex items-center gap-3">
        <h2 id="demo-accounts-title" className="shrink-0 text-dense font-semibold text-ink">
          {t("auth.demo.title")}
        </h2>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      <p className="mt-1 text-meta text-ink-muted">
        {t("auth.demo.hint")}{" "}
        <bdi dir="ltr" className="font-medium text-ink">
          {DEMO_PASSWORD}
        </bdi>
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {FEATURED.map((a) => (
          <li key={a.identifier}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => onPick(a)}
              className="group flex w-full items-center gap-2.5 rounded-control border border-line bg-surface px-3 py-2.5 text-start transition-colors hover:border-primary hover:bg-primary-soft disabled:cursor-wait disabled:opacity-60 aria-busy:opacity-100"
              aria-busy={busy(a) || undefined}
            >
              <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-primary-soft sm:grid text-meta font-semibold text-primary group-hover:bg-white">
                {busy(a) ? <Loader2 className="size-4 animate-spin" aria-hidden /> : a.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-dense font-medium text-ink">{role(a)}</span>
                <bdi dir="ltr" className="block truncate text-meta tabular-nums text-ink-muted">
                  {a.identifier}
                </bdi>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        aria-expanded={all}
        className="mt-3 inline-flex items-center gap-1 text-dense font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("auth.demo.all", { count: DEMO_ACCOUNTS.length })}
        <ChevronDown className={`size-4 transition-transform ${all ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {all && (
        <div className="mt-3 rounded-panel border border-line">
          <div className="border-b border-line p-2">
            <label htmlFor="demo-search" className="sr-only">
              {t("auth.demo.search")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                id="demo-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("auth.demo.search")}
                className="h-9 w-full rounded-control border border-line bg-surface pe-3 ps-9 text-dense outline-none focus:border-primary"
              />
            </div>
          </div>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {shown.map((a) => (
              <li key={a.identifier}>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => onPick(a)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-canvas focus-visible:bg-canvas disabled:cursor-wait"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-dense font-medium text-ink">{a.name}</span>
                    <span className="block text-meta text-ink-muted">{role(a)}</span>
                  </span>
                  <span className="shrink-0 text-end text-meta tabular-nums text-ink-muted">
                    <bdi dir="ltr" className="block">
                      {a.identifier}
                    </bdi>
                    <bdi dir="ltr" className="block">
                      {a.password}
                    </bdi>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-dense text-ink-muted">{t("auth.demo.none")}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
