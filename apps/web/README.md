# apps/web

React + Vite PWA, Arabic RTL. Skeleton scaffolded (Phase 0, Stage 2): Tailwind +
a small shadcn-style `Button`, i18next (ar default, en, RTL/LTR toggle), an app
shell, and a login page (validates against `packages/shared`'s `LoginRequestSchema`,
not yet wired to a real endpoint — auth lands in Stage 4). PWA plugin deferred
until there are real app icons to register.

Structure and rules: `../../AGENTS.md` and `../../docs/architecture/overview.md`.

## UI system

Visual rules: `../../docs/design/ui-spec.md`. Tokens are CSS variables in `src/index.css`,
mapped to Tailwind names in `tailwind.config.ts` (`bg-surface`, `text-ink-muted`,
`border-line-strong`, `text-body`, `rounded-panel`, …) — never hard-code a hex value.
Primitives live in `src/components/ui/` (Radix under the hood, shadcn-style source):
Button, Field/Input/Textarea/NativeSelect, Select, Badge, Panel, Table, Tabs, Dialog,
DropdownMenu, Tooltip, Popover, Toaster (`toast.success/error`), Skeleton. The font is
self-hosted via `@fontsource/ibm-plex-sans-arabic`.

In `pnpm dev`, open http://localhost:5173/ui-kit for a gallery of every primitive (not
routed in production builds).
