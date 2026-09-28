# Idara Pro — UI design spec (v1 redesign)

Status: **Approved direction, to implement after Phase 1.** This replaces the current look
(green gradients, top-link header) completely. Agents: follow this file exactly; if a screen
needs something not covered here, extend the system in the same spirit and add it to this file.

## 1. Direction in one paragraph

A calm, official, **white** workspace that feels like a well-run Saudi government platform
(Absher, Qiwa, Mudad) or a serious company intranet — not a startup dashboard. Trust comes
from order, not decoration: flat colors, one institutional accent, generous whitespace,
precise tables, and clear status. **No gradients, no glassmorphism, no colored page
backgrounds, no decorative illustrations, no emoji.** The one expressive element is the
**employee record header** (§7.3), designed like an official ID card — everything else stays quiet.

Audience: HR/admin at a desk (dense tables, fast forms) and employees mostly on phones
(simple, big touch targets). Arabic first, RTL; English is a secondary language toggle.

## 2. Color tokens

One accent only: **petrol** (a deep blue-green, institutional but not the flag green).
All pairs below are checked for WCAG AA.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--canvas` | `#F6F7F9` | App background behind content | — |
| `--surface` | `#FFFFFF` | Sidebar, top bar, panels, tables, inputs | — |
| `--ink` | `#1A2230` | Primary text | 15.9 on white |
| `--ink-muted` | `#5B6675` | Secondary text, labels, table meta | 5.8 on white |
| `--line` | `#E3E7ED` | Dividers, panel borders, table row lines (decorative) | — |
| `--line-strong` | `#7C8796` | Input/checkbox borders (needs 3:1) | 3.6 on white |
| `--primary` | `#0B5563` | Primary buttons, active nav, links, focus ring | 8.4 with white |
| `--primary-hover` | `#08434E` | Primary button hover/pressed | — |
| `--primary-soft` | `#E7F0F1` | Active nav item background, selected row | primary text 7.3 |
| `--success` / `--success-soft` | `#17663F` / `#E8F4EE` | Approved, active, present | 6.2 |
| `--warning` / `--warning-soft` | `#8A4A06` / `#FBF1E4` | Pending review, expiring soon, late | 6.1 |
| `--danger` / `--danger-soft` | `#A8211A` / `#FCEBEA` | Rejected, expired, errors, destructive | 6.3 |
| `--info` / `--info-soft` | `#1B4F8C` / `#E9F0F9` | Neutral notices, invited-not-accepted | 7.2 |
| `--danger-solid` | `#B42318` | Destructive button background (white text 6.6) | — |

Rules:
- Color carries **meaning only** (status, action, selection). Never decorative fills.
- Status is always **text + color** (a badge with a word), never color alone.
- Replace the existing Tailwind CSS variables in `apps/web/src/index.css` with these tokens;
  remove every gradient and every green utility class currently in use.
- Dark mode: **out of scope for v1** (government platforms are light; keep one theme well-made).

## 3. Typography

- **One family: IBM Plex Sans Arabic** (Arabic + Latin in one family, used by Saudi DGA
  platforms; self-host via `@fontsource/ibm-plex-sans-arabic`, weights 400/500/600 only —
  no Google Fonts request at runtime, the app is on a company server).
- Numbers: Western digits (0–9) everywhere; `font-variant-numeric: tabular-nums` in tables,
  amounts, dates, IDs.
- Arabic needs more line height than Latin.

| Style | Size / line-height | Weight | Use |
|---|---|---|---|
| Page title | 24 / 36 px | 600 | One per page, in the page header |
| Section title | 18 / 28 | 600 | Panel and form-section headings |
| Subsection | 16 / 26 | 600 | Card titles, dialog titles |
| Body | 15 / 26 | 400 | Default text, form values |
| Table / dense | 14 / 22 | 400 (500 for the name column) | Tables, lists |
| Label / meta | 13 / 20 | 500 | Field labels, helper text, badges, timestamps |

Rules: sentence case in English; **no all-caps labels, no eyebrow labels above headings,
no italics in Arabic**. Line length ≤ 75 characters in text blocks.

## 4. Spacing, shape, elevation

- 4 px base grid. Common steps: 4, 8, 12, 16, 24, 32, 48.
- Page padding: 32 px desktop, 16 px mobile. Space between panels: 24 px.
- Radius by role (not one radius everywhere): **6 px** controls (buttons, inputs, badges' container
  is 999 px pill), **10 px** panels and dialogs, **0** on table rows.
- Borders over shadows: panels = 1 px `--line` border on white, **no shadow**.
  Shadows only on floating layers (dropdown, dialog, toast): `0 8px 24px rgba(16,24,40,.12)`.
- Icons: `lucide-react`, 20 px (16 px inside dense tables/badges), stroke 1.75, color inherits.
  Directional icons (chevrons, arrows, "back") must mirror in RTL.

## 5. Components (install real primitives)

Install **shadcn/ui properly** now (Radix under the hood) for accessible Dialog, DropdownMenu,
Tooltip, Tabs, Select, Popover, and Sonner for toasts. If the CLI is not usable
non-interactively, copy the component source files manually into `src/components/ui/` — the
result is the same. Restyle them with the tokens above. Replace the hand-rolled primitives.

| Component | Spec |
|---|---|
| Button | Heights 40 (default), 32 (in tables), 48 (mobile primary). Variants: **primary** (petrol solid), **secondary** (white, `--line-strong` border, ink text), **ghost** (text only, soft hover), **danger** (red solid, only for irreversible actions). Label = exact action verb ("حفظ التغييرات", "إرسال الدعوة"), never "إرسال/Submit" alone. Icon optional at inline-start. Loading = spinner replaces icon, label stays, button disabled. |
| Input / Select / Textarea | Height 40, white, 1 px `--line-strong`, radius 6, 12 px inline padding. Label **above** the field (13/500), helper/error text below (13). Error = `--danger` border + message that says how to fix it. Focus = 2 px `--primary` ring, 2 px offset. Fields with LTR content (IBAN, phone, email, ID numbers) get `dir="ltr"` and text-align end-aligned for RTL visual consistency. |
| Badge (status) | Pill, 13/500, soft background + dark text of the same hue, optional 6 px dot. Fixed vocabulary: فعال/نشط (success), بانتظار المراجعة (warning), مرفوض (danger), مدعو (info), غير نشط (neutral grey `#EEF0F3`/`--ink-muted`), ينتهي قريباً (warning), منتهي (danger). |
| Table | White panel, header row 13/500 `--ink-muted` on `--canvas`, rows 52 px (44 dense), 1 px `--line` between rows, no zebra, row hover `--canvas`, clickable rows show pointer and open the detail page. First column = person/name with initials avatar. Actions in the last column as a "⋯" DropdownMenu (not rows of buttons). Pagination bottom, "عرض 1–20 من 38". Sticky header on long pages. |
| Panel | White, 1 px `--line`, radius 10, padding 24; optional header row (section title + actions at inline-end) separated by `--line`. |
| Tabs | Underline style: active tab `--primary` text + 2 px bottom bar; no pill tabs. |
| Dialog | Only for short confirmations and the **reject-with-reason** form. Width 480. Destructive dialogs name the thing: "حذف مستند «جواز السفر»؟". |
| Toast | Sonner, bottom corner on the inline-end side, away from the sidebar (bottom-left in Arabic, bottom-right in English). Past-tense confirmation matching the button: "تم حفظ التغييرات". Errors stay until dismissed. |
| Empty state | Inside the panel: one line of what's missing + the primary action. E.g. "لا يوجد موظفون بعد." + [إضافة موظف]. No illustrations. |
| Skeleton | Grey `#EEF0F3` blocks matching the layout while loading; no spinners on whole pages. |
| Avatar | Initials (first letter of first + last Arabic name) on `--primary-soft`, `--primary` text; 32 px in tables, 40 in top bar, 72 in record header. |

## 6. App shell

### 6.1 Layout (RTL — sidebar on the right)

```
┌───────────────────────────────────────────────────────────┬───────────────┐
│ Top bar: page title / breadcrumb …… [🔔] [اسم المستخدم ▾] │  ▣ إدارة برو  │
├───────────────────────────────────────────────────────────┤               │
│                                                           │ ● الرئيسية    │
│   Page header: title + short description   [Primary CTA]  │   الموظفون    │
│                                                           │   طلبات المراجعة│
│   ┌──────────────── content (max 1280) ────────────────┐  │   ─────────── │
│   │                                                    │  │   إعدادات الشركة│
│   │                                                    │  │   ملفي        │
│   └────────────────────────────────────────────────────┘  │               │
│                                                           │ [⇤ طي القائمة]│
└───────────────────────────────────────────────────────────┴───────────────┘
```

- **Sidebar** (white, 1 px `--line` on its inline-end edge): width **264 px expanded, 72 px collapsed**.
  - Top: company logo mark (or initials tile) + product name "إدارة برو"; collapsed = mark only.
  - Nav items: icon + label, 40 px tall, radius 6, 12 px inline padding. Active = `--primary-soft`
    background + `--primary` text + 3 px bar on the inline-start edge. Hover = `--canvas`.
  - Groups separated by a divider and a small group title (13/500, `--ink-muted`), **not** all caps.
  - Bottom: collapse toggle ("طي القائمة" / icon only when collapsed).
  - Collapsed: icons centered, label shown in a Tooltip on hover/focus; badges become a dot.
  - Collapse state persists per user (localStorage, try/catch) and animates width 200 ms ease-out
    (disabled under `prefers-reduced-motion`).
  - Pending counts appear as a small count badge on the nav item (e.g. طلبات المراجعة 3).
- **Top bar** (white, 64 px, 1 px `--line` bottom): breadcrumb on inline-start; notifications bell
  (count badge, opens a Popover list, 360 px wide) and user menu (avatar + name → ملفي، English/العربية، تسجيل الخروج) on inline-end.
- **Responsive**: ≥1280 expanded by default; 1024–1279 collapsed by default; <1024 sidebar becomes an
  off-canvas drawer opened by a menu button in the top bar, with overlay; close on route change/Esc.
- **Permission-driven nav**: show only items the user can use. Modules not built yet (attendance,
  leave, custody, payroll) are **not shown at all** — no "coming soon" items.

### 6.2 Navigation map (v1)

| Group | Item | Icon (lucide) | Who sees it |
|---|---|---|---|
| — | الرئيسية (Dashboard) | `LayoutDashboard` | Everyone |
| الموارد البشرية | الموظفون | `Users` | employees:read |
| | طلبات المراجعة (+count) | `ClipboardCheck` | employees:review |
| | الأقسام والفروع | `Building2` | company settings permission |
| حسابي | ملفي | `UserRound` | employees:self-service |

Later phases add under الموارد البشرية: الحضور (`Clock`), الإجازات (`CalendarDays`),
العهد (`Wallet`), الرواتب (`Banknote`) — same pattern.

## 7. Page templates

### 7.1 Page header (every page)
Title (24/600) + one-line description (15, `--ink-muted`) on inline-start; the page's single
primary action on inline-end (e.g. "إضافة موظف"). Secondary actions go in a "⋯" menu. No
hero banners, no stat strips unless the page is the dashboard.

### 7.2 List page (e.g. الموظفون)
```
[Page header ......................................... (+ إضافة موظف)]
[بحث بالاسم أو الرقم الوظيفي ▢]  [القسم ▾] [الفرع ▾] [الحالة ▾]   (38 موظفاً)
┌ Table ────────────────────────────────────────────────────────────┐
│ الموظف (avatar+name+job) │ الرقم الوظيفي │ القسم │ الفرع │ الحالة │ ⋯ │
└───────────────────────────────────────────────────────────────────┘
                                                    [pagination]
```
Filters in the URL query string so the view is shareable and survives refresh.

### 7.3 Employee record (detail) — the one expressive element
A record header styled like an official ID card, then tabs:
```
┌─ Record header (white panel, 4 px petrol band on inline-start edge) ─┐
│ (72 avatar)  أحمد محمد العتيبي            [فعال]      [تعديل] [⋯]   │
│              محاسب · قسم المالية                                     │
│ ─────────────────────────────────────────────────────────────────── │
│ الرقم الوظيفي  E-104 │ رقم الهوية 10•••••789 │ تاريخ التعيين 2025-03-01 │
│ الفرع الدمام │ المدير سارة القحطاني │ الحساب: مفعل / مدعو / لم يُدعَ     │
└─────────────────────────────────────────────────────────────────────┘
[البيانات الوظيفية] [الراتب] [المستندات] [السجل]
```
- The facts row is a 3-column definition grid (label 13 `--ink-muted` above value 15/500),
  wrapping to 1 column on mobile. Sensitive values (ID, IBAN) masked unless permitted.
- Account status chip + contextual action: "إرسال دعوة" / "إعادة إرسال الدعوة".
- السجل tab = the audit trail for this employee: date, who, what changed (before → after).

### 7.4 Form page (add/edit)
Single column, max width 720, grouped into panels with section titles
(البيانات الشخصية، البيانات الوظيفية، الراتب). Two fields per row on desktop only where they
belong together (e.g. name ar/en). **Sticky footer bar** with [حفظ التغييرات] (primary) and
[إلغاء] (ghost); warn before leaving with unsaved changes. Validation inline on blur and on submit;
scroll to and focus the first error.

### 7.5 Review queue (طلبات المراجعة)
Table: الطلب (IBAN / مستند + type) │ الموظف │ تاريخ الإرسال │ الحالة │ actions.
Row actions are visible buttons here (this page exists to act): [اعتماد] (secondary, success
icon) and [رفض] (secondary, danger text) → reject opens a Dialog with a required reason
textarea. Own submissions show a muted note "لا يمكنك مراجعة طلبك" instead of buttons.
Documents open in a preview side panel (PDF/image) before deciding.

### 7.6 Dashboard (الرئيسية)
Action first, statistics second. For HR:
```
[Page header: صباح الخير، سارة — الأحد 28 سبتمبر 2026]
┌ يحتاج إجراءك (panel, full width) ─────────────────────────────────┐
│ 3 طلبات بانتظار المراجعة                          [فتح قائمة المراجعة]│
│ 2 مستندات تنتهي خلال 30 يوماً                           [عرض]       │
│ 1 دعوة لم تُقبل منذ أكثر من 3 أيام                  [إعادة الإرسال]  │
└───────────────────────────────────────────────────────────────────┘
┌ الموظفون ────────┐┌ الحسابات ───────────┐┌ المستندات ─────────────┐
│ 38 إجمالي        ││ 31 مفعل · 5 مدعو    ││ 4 تنتهي قريباً · 1 منتهٍ │
│ 36 نشط · 2 غير نشط││ 2 لم يُدعَ          ││                        │
└──────────────────┘└─────────────────────┘└────────────────────────┘
```
When nothing needs action: "لا توجد مهام بانتظارك اليوم." (one quiet line).
For employees: "أكمل ملفك" checklist (phone, IBAN, documents — each with status badge) until
complete, then their document statuses and latest notifications. Designed mobile-first.

### 7.7 Login and auth pages
White page, centered 400 px panel: logo mark + "إدارة برو" + company name, then the form.
Below the panel, a thin footer line with the company name and year. Same template for
accept-invitation, forgot and reset password. No background images or gradients.
Password fields have a show/hide toggle. The primary button is full width.

### 7.8 My profile (ملفي), employee view
Same record header as 7.3 (read-only HR fields), then panels: بيانات التواصل (editable),
الحساب البنكي (IBAN with its review badge and rejection reason if any), مستنداتي (upload +
list with status). On mobile: panels stack, buttons full width, 48 px touch targets.

## 8. Writing (Arabic UI copy)

- Plain Modern Standard Arabic, short sentences, verbs on buttons, same verb from button to toast
  ("إرسال الدعوة" → "تم إرسال الدعوة").
- Errors say what happened and how to fix: "رقم الآيبان غير صحيح. تأكد أنه يبدأ بـ SA ويتكون من 24 خانة."
- No exclamation marks, no apologies, no "عذراً". Empty states invite action.
- Dates: `2026-09-28` in tables; long form "الأحد 28 سبتمبر 2026" in headers. Gregorian only in v1.
- Money: "8,000.00 ر.س" — tabular digits, currency after the number.
- All strings via i18next keys (ar + en); never hard-coded.

## 9. RTL and accessibility rules

- Use logical Tailwind utilities only (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`,
  `text-start`); **no `left`/`right`** in new code. The English toggle must flip the whole
  layout correctly (sidebar moves to the left).
- Wrap LTR fragments inside Arabic text with `<bdi>` / `dir="ltr"` (emails, IBANs, IDs, codes).
- WCAG 2.1 AA: contrast per §2, visible focus ring on every interactive element, full keyboard
  use (sidebar, menus, dialogs trap focus, Esc closes), `aria-current="page"` on active nav,
  labels tied to inputs, errors announced (`aria-live`), touch targets ≥ 44 px on mobile.
- Motion: only sidebar collapse, dropdown/dialog open, and toast; 150–200 ms; all disabled under
  `prefers-reduced-motion`. No page-load animations.

## 10. Implementation order (one PR each, reviewed in the browser)

1. Tokens + font + remove all gradients/green; install shadcn/Radix primitives; restyle Button,
   Input, Select, Badge, Table, Panel, Tabs, Dialog, Toast, Skeleton.
2. App shell: collapsible sidebar (all states, responsive drawer), top bar, notifications
   popover, user menu, language toggle with correct RTL/LTR flip.
3. Auth pages (7.7).
4. Employees list, record, form (7.2–7.4) and review queue (7.5).
5. Dashboards for HR and employee (7.6) and my profile (7.8).

Step 2 (done): shell lives in `apps/web/src/app/shell/`; nav config in `nav-items.ts`.

Step 1 notes (done): native `<select>` is kept as `NativeSelect` for react-hook-form
`register` forms; the Radix `Select` is for controlled filters. `Card` was replaced by `Panel`.
A dev-only gallery at `/ui-kit` shows every primitive for review.

Acceptance for each step: screenshots at 1440 px, 1024 px and 390 px (mobile), in Arabic and
English; keyboard-only walkthrough; no `left/right` utilities and no gradient in the diff.
