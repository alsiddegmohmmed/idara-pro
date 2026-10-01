# Idara Pro — UX redesign v2 (Oct 1, 2026)

Why the platform still doesn't feel like a stable HR product, and the decisions that fix it.
Based on: Siddeg's walkthrough notes, a walkthrough of the running app (latest master `3919c3c`, demo data), the web code, HR products used as reference (BambooHR, Personio, HiBob, Workday, Rippling, Jisr), and Saudi MHRSD disciplinary rules.

---

## 0. Diagnosis: why it feels "glitchy" and "AI-generic"

| Symptom | Root cause (verified) |
|---|---|
| Tabs jump when switching | Each tab mounts empty and fetches only when opened → a fixed `h-40` skeleton → real content. The page height collapses, the browser clamps the scroll, and the tab bar moves under the cursor (a second click in the walkthrough missed because of this). Old content also stays visible for a moment after the URL changes. |
| "No loading anywhere" / pages re-load every time | `new QueryClient()` with defaults: `staleTime: 0` → every visit refetches and re-skeletons; `retry: 3` with backoff → an error takes ~7 s to show, with no feedback. No global "working" indicator. |
| Stranded after opening something | "التفاصيل" in the inbox, attendance rows and notifications go to a **different page** (module list or profile). No way back to the item you came from, no "next". |
| Can't decide from a row | Leave, warnings and short permissions show one row per request with approve/reject on it — no context (balance, history, team overlap, prior warnings). |
| Same action looks different everywhere | Approve/reject is: secondary pair "اعتماد/رفض" (leave), "موافقة/رفض" (inbox), filled "موافقة" + text "رفض" (short permissions), filled "إصدار" + text "رفض" (warnings). |
| Generic profile | Header card + 6 tabs that are all the same definition grid. The first tab is labelled "البيانات الوظيفية" but shows personal data; IBAN sits in personal data; nothing answers "how is this employee doing right now?". |
| Short permissions page | 7 columns crammed into a table: names wrap to 3 lines, dates break ("2026-\n10-01"), reason truncated with no way to read it, status column repeated on a "pending" tab, no allowance info for the approver. |

The fix is mostly **system-level** (one loading model, one list→detail pattern, one decision component), then page redesigns on top of it.

---

## 1. Foundation: make every page feel stable

**1.1 Data caching (`main.tsx`)**
```ts
new QueryClient({ defaultOptions: { queries: {
  staleTime: 30_000,          // revisits render instantly from cache, refresh quietly
  gcTime: 10 * 60_000,
  retry: 1, retryDelay: 800,  // errors show in ~1 s, not ~7 s
  refetchOnWindowFocus: true, // queues stay fresh when HR comes back to the tab
  placeholderData: keepPreviousData, // filters/month changes keep old rows until new arrive
}}})
```

**1.2 Tabs that never jump** (applies to every `Tabs` in the app)
- **Prefetch all tab data when the record opens** (`queryClient.prefetchQuery` for each allowed tab) and on hover/focus of a tab trigger. By the time the user clicks, data is there.
- **Keep visited panels mounted**: Radix `forceMount` + `hidden` on inactive panels (`content-visibility: hidden` per modern-web-guidance "faster SPA view transitions"), so going back to a tab is instant and keeps its scroll/form state.
- **Reserve height**: the panel area gets `min-height: calc(100dvh - <header>)` so switching tabs never shortens the page → no scroll clamp.
- **Skeletons shaped like the content** (`TableSkeleton rows={5}`, `FactsSkeleton`), not one grey block.
- Tab in the URL with `replace: true` (no back-button spam). Optional: cross-fade with `document.startViewTransition` (Baseline 2025, progressive enhancement, off under reduced motion).

**1.3 Navigation feedback**
- Thin top progress bar (inline-start → inline-end, petrol, 2 px) shown when any page-level query has been fetching > 300 ms (`useIsFetching`). Instant pages show nothing; slow ones never look frozen.
- Page header (title, actions) renders immediately; only the data area shows skeletons.
- **Scroll restoration**: add `<ScrollRestoration />` to the app shell (the app already uses `createBrowserRouter`, which supports it) so "back" returns to the same row. Filters already in the URL.
- **Prefetch on row hover/focus** for every list → detail.

**1.4 One decision component** — `DecisionBar`
Same everywhere (inbox, panels, list rows): `[✓ موافقة]` primary · `[✕ رفض]` secondary with danger text → reject opens the reason dialog (required where the API requires it). Context-specific verbs only where the act differs: إصدار الإنذار، تسجيل الصرف، تسوية. Loading state on the clicked button, row removed optimistically, toast names the thing: "تمت الموافقة على إجازة لمى الرشيد (5 أيام)".

---

## 2. One pattern for "look, decide, move on": the review panel

Reference: Gmail/Linear inbox (auto-advance), Rippling & BambooHR approvals (request + balance in one view), Personio (approve from Tasks with the team calendar in view).

- **Desktop (≥1024 px):** clicking a row opens a **side panel** (560 px, on the inline-end side) over the list. The list stays, the row stays highlighted. URL: `?item=<id>` so refresh/back/notifications work.
- **Phone:** the panel is a full-screen page with a back arrow that returns to the list at the same scroll position.
- Panel header: `‹ السابق` `التالي ›` (also ↑/↓ keys), `3 من 12`, close (Esc).
- **After a decision the panel moves to the next item automatically.** When the queue is empty: a quiet end state "أنهيت كل الطلبات" + link back to the dashboard.
- Secondary link at the bottom: "فتح في صفحة الإجازات" for anyone who wants the full module.

Used by: **inbox, leave approvals, short permissions, warnings, custody, adjustments, attendance (person view), review queue (IBAN/documents)**. Notifications open the same panel for their item.

### 2.1 What each panel shows (the decision context)

| Request | Context shown | Data source |
|---|---|---|
| **Leave** | Request card (type, dates, working days, reason, attachment preview) · **balance before → after**, red if it goes negative (BambooHR) · days taken this year per type · **who else is off on these dates** in the same department/manager (Personio team calendar) · public holidays inside the period · last 12 months of leave · previous rejections | `/leave/requests?employeeId`, `/leave/balances`, `/leave/calendar?from&to`, `/holidays` — all exist |
| **Short permission** | Mini timeline of that day's shift with the requested window on it · **monthly allowance: used / remaining after approval** · this month's permissions · late arrivals this month | `/shortleave/requests?employeeId` exists; needs `GET /shortleave/allowance?employeeId&month` (new, small) |
| **Warning** | Violation, incident date and **"متبقٍ X يوماً على مهلة الـ30 يوماً"** (violations can't be acted on after 30 days) · **prior warnings in the last 180 days** with a suggested escalation (repeat within 180 days = harsher penalty; after 180 days the ladder resets) · proposed by · attendance summary if attendance-related · **employee's statement** (required by the rules before a penalty) · after issuing: acknowledgment status + 15-day objection window | `/warnings?employeeId` exists; statement/attachment fields need backend |
| **Custody** | Amount, purpose · employee's open custody and unsettled total · history | `/custody/requests?employeeId` exists |
| **Adjustment** | Payroll month, base salary, other adjustments that month, deduction-cap check | existing salary + adjustments endpoints |
| **IBAN / document** | Document preview, previous value, who submitted | existing |

Saudi rules source: MHRSD "Disciplinary Rules" (30-day limit, 180-day repetition, written notice + hearing the worker's defense, 15-day objection).

---

## 3. Attendance: a person view, not the profile

Row click on الحضور opens **"حضور الموظف"** (panel on desktop, page on phone; URL `/attendance/people/:id?month=2026-10`). It answers "how does this person attend?":

- Header: name, job, department, schedule (08:00–17:00), branch · secondary link "الملف الكامل".
- Month selector + KPIs: نسبة الحضور، أيام التأخير (and total minutes)، الغياب، الخروج المبكر، الاستئذانات المستخدمة، الإجازات.
- **Month calendar grid** colored by status (present / late / absent / leave / holiday / weekend) — click a day to see punches and corrections.
- Daily list below: in/out times, late minutes, corrections with who made them; "تصحيح" action inline.
- `السابق / التالي` walks the employees of the list you came from (same date and branch filter).

Data: `/attendance/days?employeeId&from&to` already exists.

---

## 4. Employee record (الملف) — rebuilt

Reference: BambooHR (summary rail + Job/Time off/Documents tabs, job history with effective dates), HiBob and Workday (overview first, sections by purpose).

**Layout (desktop):** a sticky **summary rail** on the inline-start side (avatar, name, title, status, department, manager (link), branch, tenure "منذ 3 سنوات"، phone/email with copy, quick actions: تعديل · اقتراح إنذار · خصم/إضافة) + the main area with tabs. On phones the rail becomes a compact header.

**Tabs, by purpose (with counts):**
1. **نظرة عامة** (default, new) — alerts that need action (missing IBAN, document expiring, contract ending, **probation ending**), this month's attendance mini-calendar + %, leave balance cards, open requests, recent activity.
2. **الوظيفة** — job info, contract(s), schedule; later a **job history** table (title/department/manager/salary changes with effective dates).
3. **الحضور والإجازات** — same components as §3 + leave history + short permissions.
4. **الراتب والمزايا** — salary components with total package, bank (IBAN), insurance, payslips.
5. **المستندات (4)**
6. **البيانات الشخصية** — personal + emergency contacts.
7. **الإنذارات والسجل** — warnings + audit trail.

Design rules that remove the "generic" feel: real hierarchy (the rail is the identity, the overview is the state, tabs are detail) · **edit per section** (pencil on a section opens just that section's form) instead of one long global edit form · empty values hidden, with one "أكمل البيانات" prompt · numbers and statuses as compact cards, not label/value grids everywhere.

---

## 5. Job titles: a managed list, not free text

Standard in HR systems (BambooHR job-title list field, Workday job profiles, Zoho "designation", Jisr job titles). Free text produces "محاسب" / "محاسبة" / "Accountant" for the same job and breaks reports.

- New table `positions` (name_ar, name_en, optional department, optional occupation code for Qiwa/GOSI later), per company.
- Setup tab **"المسميات الوظيفية"**.
- Employee form: **searchable combobox**; users with `org:manage` can type a new one and pick **"إضافة «محاسب أول»"** inline (no detour to setup).
- Migration: create positions from the distinct existing `job_title` values; employees get `position_id`; keep the text column as a snapshot until job history exists.

---

## 6. الاستئذانات — rebuilt from scratch

**Employee side**
- Top: allowance bar "استخدمت 1:30 من 4:00 ساعات هذا الشهر" (+ pending).
- One button "طلب استئذان" → step 1: three large choices: **تأخير صباحي / خروج مبكر / خروج أثناء الدوام**.
- Step 2: date (default today) and **times pre-filled from the shift** (late arrival starts at shift start; early leave ends at shift end) + duration chips (30د · ساعة · ساعة ونصف · ساعتان) + reason. Shows "يتبقى لك 2:30 بعد هذا الطلب" live.
- My permissions as cards grouped by month with status.

**Approver side**
- Pending list **grouped by day** (اليوم، غداً، …). Each row: person · type icon + label · window "08:00 → 09:00 · ساعة" on one line (`<bdi dir="ltr">`) · reason (2 lines, full on hover/panel) · **remaining allowance after approval** · DecisionBar. Row click → review panel (§2.1).
- "الكل": filters (month, employee, status) and a 5-column table: الموظف، اليوم، النوع والوقت، الحالة، القرار بواسطة.
- Backend: `GET /shortleave/allowance?employeeId&month` and the employee's schedule times in the request view.

---

## 7. Dashboard v2 (HR / manager)

Reference: BambooHR home ("Who's out", celebrations), Personio home cards (tasks), Jisr (expiries, probation).

Order:
1. **Inbox card** (replaces the 6-row "يحتاج إجراءك"): "12 طلباً بانتظارك" + chips per type + **"ابدأ المراجعة"** → opens inbox review mode on the oldest item.
2. **Today**: present / late / absent / on leave tiles (keep).
3. **من خارج العمل** — today and this week: leave + short permissions, avatars, with dates.
4. **مواعيد قادمة (30 يوماً)** — probation ends (90 days from hire unless the contract says otherwise), contracts ending, iqama/document expiries, optional birthdays and work anniversaries.
5. **Payroll this month** — stage (لم يُحتسب / بانتظار الاعتماد / مُصدَّر), days to payday, blocking warnings.
6. Attendance trend (keep). Move "الموظفون حسب القسم" and the custody summary to reports.

Managers get the same cards scoped to their team.

---

## 8. Platform things every mature HRIS has

- **People search in the top bar** (Ctrl/⌘+K): find an employee by name, number or ID and jump to the record; also "go to page".
- **Every request has its own URL** (`/leave/requests/:id`, …) that opens the review panel → notifications, emails and the inbox link to the exact item, never to a list.
- **Activity timeline on each request** (submitted → approved by X at 10:42) — builds trust.
- **Org chart / directory** — later.

---

## 9. Build order (one PR each, reviewed in the browser)

| PR | Scope | Backend |
|---|---|---|
| A | Foundation: query defaults, prefetch, stable Tabs, scroll restoration, progress bar, DecisionBar, shaped skeletons | — |
| B | Review panel + inbox review mode (auto-advance) + leave / custody / adjustment contexts | — |
| C | Attendance person view | — |
| D | Employee record redesign (rail, overview, purpose tabs, per-section edit) | probation date (derived), job history later |
| E | Short permissions rebuild + its panel context | allowance by employee, schedule in view |
| F | Job titles (positions) | migration + CRUD |
| G | Warning decision context (30/180-day rules, employee statement) | statement + attachment fields |
| H | Dashboard v2 + people search | upcoming-dates endpoint (or client-side from existing data) |

PR A alone removes most of the "glitchy" feeling across the whole app.
