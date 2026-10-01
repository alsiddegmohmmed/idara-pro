import { useTranslation } from "react-i18next";

type Role = "admin" | "executive" | "hr_admin" | "branch_hr" | "accountant" | "manager" | "team_lead" | "employee";

interface Account {
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

/** Accounts and passwords under the login form; clicking one fills the form. */
export function DemoAccounts({ onPick }: { onPick: (account: Account) => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="mt-6 border-t border-line pt-4" aria-labelledby="demo-accounts-title">
      <h2 id="demo-accounts-title" className="text-dense font-semibold">
        {t("auth.demo.title")}
      </h2>
      <p className="mb-2 text-meta text-ink-muted">{t("auth.demo.hint")}</p>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.identifier}>
            <button
              type="button"
              onClick={() => onPick(a)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-canvas focus-visible:bg-canvas"
            >
              <span className="min-w-0">
                <span className="block truncate text-dense font-medium">{a.name}</span>
                <span className="block text-meta text-ink-muted">{t(`auth.demo.roles.${a.role}`)}</span>
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
      </ul>
    </section>
  );
}
