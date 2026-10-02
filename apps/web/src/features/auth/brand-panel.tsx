import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// ui-spec §7.7, sign-in pages: the product's signature moment — checking in at a branch — drawn as the
// branch on a street grid with its attendance radius, and the attendance card showing Riyadh's time now.
// Decorative except the clock; hidden below lg (the form comes first on phones).

const RIYADH = "Asia/Riyadh";

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ZoneMap(): React.JSX.Element {
  // Streets: a loose grid at a slight angle, like a city block seen from above.
  const streets = [80, 170, 270, 360, 450];
  return (
    <svg viewBox="0 0 520 520" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="zone-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5fb3bf" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#5fb3bf" stopOpacity="0.04" />
        </radialGradient>
        <radialGradient id="map-fade-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="map-fade">
          <rect width="520" height="520" fill="url(#map-fade-gradient)" />
        </mask>
      </defs>
      <g mask="url(#map-fade)" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1.5">
        <g transform="rotate(-12 260 260)">
          {streets.map((x) => (
            <line key={`v${x}`} x1={x} y1="-40" x2={x} y2="560" />
          ))}
          {streets.map((y) => (
            <line key={`h${y}`} x1="-40" y1={y} x2="560" y2={y} />
          ))}
          <line x1="-40" y1="560" x2="560" y2="-40" strokeWidth="6" strokeOpacity="0.06" />
        </g>
      </g>
      {/* The attendance radius, opening once on load. */}
      <circle className="brand-ring" cx="260" cy="260" r="150" fill="url(#zone-fill)" stroke="#8fd0d9" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 7" />
      <circle className="brand-ring" style={{ animationDelay: "120ms" }} cx="260" cy="260" r="92" fill="none" stroke="#8fd0d9" strokeOpacity="0.25" strokeWidth="1" />
      {/* Someone inside the radius, and the line to the branch. */}
      <line x1="260" y1="260" x2="336" y2="214" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="2 5" />
      <circle cx="336" cy="214" r="13" fill="#8fd0d9" fillOpacity="0.25" />
      <circle cx="336" cy="214" r="6" fill="#ffffff" />
      {/* The branch. */}
      <circle cx="260" cy="260" r="26" fill="#ffffff" />
      <path d="M260 246c-6 0-10.5 4.6-10.5 10.3 0 7.4 10.5 17.7 10.5 17.7s10.5-10.3 10.5-17.7C270.5 250.6 266 246 260 246Zm0 14.2a3.9 3.9 0 1 1 0-7.8 3.9 3.9 0 0 1 0 7.8Z" fill="#06343d" />
    </svg>
  );
}

function AttendanceCard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const lang = i18n.language === "ar" ? "ar" : "en";
  const time = new Intl.DateTimeFormat(`${lang}-u-nu-latn`, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: RIYADH }).format(now);
  const day = new Intl.DateTimeFormat(`${lang}-u-nu-latn`, { weekday: "long", day: "numeric", month: "long", timeZone: RIYADH }).format(now);
  const hijri = new Intl.DateTimeFormat(`${lang}-SA-u-ca-islamic-umalqura-nu-latn`, { day: "numeric", month: "long", year: "numeric", timeZone: RIYADH }).format(now);
  return (
    <div className="brand-card w-[300px] rounded-2xl bg-white p-5 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-dense font-semibold">{t("auth.brand.cardTitle")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-meta font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          {t("auth.brand.inZone")}
        </span>
      </div>
      <p className="mt-4 text-meta text-ink-muted">{t("auth.brand.nowInRiyadh")}</p>
      <p className="text-[44px] font-semibold leading-[52px] tracking-tight tabular-nums">
        <bdi dir="ltr">{time}</bdi>
      </p>
      <p className="mt-1 text-dense text-ink">{day}</p>
      <p className="text-meta text-ink-muted">{hijri}</p>
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-meta text-ink-muted">
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        {t("auth.brand.cardFoot")}
      </div>
    </div>
  );
}

export function BrandPanel(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <aside className="relative hidden overflow-hidden bg-primary-deep text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_45%,rgba(95,179,191,0.16),transparent_60%)]" aria-hidden />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-12 pt-10">
        {/* The branch and its radius, with the check-in card overlapping the zone's lower edge. */}
        <div className="aspect-square h-[min(380px,42vh)]">
          <ZoneMap />
        </div>
        <div className="-mt-[min(96px,10vh)] ms-[min(180px,14vw)] self-center">
          <AttendanceCard />
        </div>
      </div>
      <div className="relative px-12 pb-12 pt-10">
        <h2 className="max-w-[460px] text-[34px] font-semibold leading-[1.45]">{t("auth.brand.headline")}</h2>
        <p className="mt-3 max-w-[440px] text-body text-white/70 [@media(max-height:760px)]:hidden">{t("auth.brand.body")}</p>
      </div>
    </aside>
  );
}
