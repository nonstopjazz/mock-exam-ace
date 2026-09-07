---
name: gsat-ui-design
description: The existing GSAT (Lovable-built) design system for this repository. Load this BEFORE writing or editing ANY frontend code here — a new page, a new component, a layout change, styling, Tailwind classes, shadcn/ui usage, responsive work, loading/empty/error states, or anything under /learn. Use it whenever the task involves React, TSX, CSS, Tailwind, UI, screens, dashboards, forms, cards, or "make it look like the rest of the site".
---

# GSAT Design System — preserve and extend

## The prime directive

> **Preserve and extend the existing Lovable GSAT design system. Do not redesign the product unless
> the owner explicitly requests a redesign.**

Everything new must look like it was always part of this site. The test a reviewer will apply:
*could this screen be dropped into the existing site without anyone noticing it was added later?*

🛑 **Never** introduce a second colour palette, font, radius scale, or shadow system. There is one of
each, defined in `src/index.css` and `tailwind.config.ts`. If you find yourself writing a hex code,
a `font-family`, or a `border-radius` in pixels, stop — the token already exists.

---

## 1. What this site looks like

A **warm, parchment-toned "adventure & learning" theme**, not a cool corporate SaaS dashboard.
The background is warm off-white (`42 45% 96%`), not white and not grey-blue. Cards sit on it with a
soft border and a faint shadow. Accents are amber gold, deep teal and terracotta — an
exam-adventure feel, aimed at Taiwanese high-school students.

| Role | Token | Colour | Used for |
|---|---|---|---|
| Primary | `primary` | amber gold `38 92% 50%` | main actions, achievement, progress |
| Secondary | `secondary` | deep teal `184 65% 42%` | knowledge/learning, second stat |
| Accent | `accent` | terracotta `16 75% 55%` | focus/action, third stat |
| Background | `background` | warm parchment `42 45% 96%` | page ground |
| Card | `card` | `40 40% 98%` | every card surface |
| Muted | `muted` / `muted-foreground` | parchment grey | secondary text, inert chips |
| Semantic | `success` `warning` `destructive` | | states |
| Themed | `treasure` `explorer` `map` | | gamified accents |

**Dark mode exists** (`.dark` class, every token redefined). ⚠️ Any hard-coded colour silently
breaks it. Always use the token.

### Typography

- `font-display` = **Fredoka**, fallback Nunito — playful, rounded.
- `font-sans` = **Inter + Noto Sans TC** — body, and the Chinese text this site is mostly made of.
- `font-mono` = JetBrains Mono.

⚠️ **`src/index.css` already applies `font-display` to every `h1`–`h6` globally.** Never add
`font-display` to a heading, and never override a heading's font.

Observed hierarchy — match it, don't invent new sizes:

| Element | Classes |
|---|---|
| Page title | `text-2xl md:text-4xl font-bold text-foreground` |
| Section / card heading | `font-semibold text-foreground` (often `text-lg`) |
| Big stat number | `text-3xl` or `text-4xl font-bold text-foreground` |
| Page subtitle | `text-sm md:text-base text-muted-foreground` |
| Body | default |
| Meta / hint | `text-sm text-muted-foreground`, or `text-xs` |

### Spacing, radius, shadow

- **Radius:** `--radius: 0.75rem`. `rounded-lg` (12px) is the default for cards and panels;
  `rounded-md` for buttons and inputs; `rounded-full` for badges and avatars. Nothing else.
- **Rhythm:** an even 4px scale. Card padding `p-6`. Grid gaps `gap-4` (tight) / `gap-6` (roomy).
  Section separation `mb-8`. Stacked content `space-y-2` / `space-y-3`.
- **Page shell:** `container mx-auto px-4 py-8` inside `min-h-screen bg-background`.
- **Shadows:** `shadow-sm` (Card default) → `hover:shadow-lg` on interaction. Custom:
  `shadow-card`, `shadow-button`, `shadow-treasure`. Do not invent shadow values.

---

## 2. Rules

### Always

1. **Reuse `src/components/ui/*` (shadcn/ui) first.** It is complete — 45+ primitives are already
   installed. Check before writing anything.
2. **Reuse the app components in §3 second.**
3. **Use tokens:** `bg-primary`, `text-muted-foreground`, `border-border`. Never a hex, never
   `bg-gray-100`, never an arbitrary value like `bg-[#f5f5f5]`.
4. **Icons: `lucide-react` only.** Sizes: `h-4 w-4` inside buttons/nav · `h-5 w-5` section headings ·
   `h-6 w-6` stat and page-header icons · `h-8 w-8` page header on desktop · `h-12 w-12` empty and
   loading states.
5. **Mobile and desktop both finished**, in the same pass. `md:` is this site's main hinge.
6. **Every state:** loading · empty · error · success · disabled. §5 has the house idioms.
7. **Chinese UI text**, matching the existing tone (concise, friendly, no exclamation-mark spam).

### Never

1. 🛑 A second palette, font, radius scale or shadow system.
2. 🛑 Gradients, glassmorphism or oversized hero cards *for decoration*. Gradients here are
   **functional and subtle** — a `/10` tint identifying a stat card, nothing more. No full-bleed
   gradient headers, no frosted panels, no glowing borders.
3. 🛑 The generic AI dashboard look: purple-blue gradients, giant rounded blobs, emoji headings,
   three-column KPI walls with no information, dark "hero" bands.
4. 🛑 Hard-coded colours — they break dark mode.
5. 🛑 Wrapping or re-styling a shadcn primitive when a `className` would do.
6. 🛑 A new animation keyframe when one of the 14 in `tailwind.config.ts` fits.

### Extending is allowed

A new *component pattern* is fine — a roster row, a class card, an assignment list item. It must be
built **out of existing tokens and primitives**, and must look at home beside `StatCard` and the
vocabulary hub cards. Extend the language; do not add a second one.

---

## 3. Reuse map — check here before writing

| Need | Use |
|---|---|
| Page shell with nav + footer | `@/components/layout/Layout` |
| Stat tile | `@/components/galaxy/StatCard` — `variant`: `default` / `treasure` / `explorer` |
| Progress bar with label | `@/components/ProgressBar` (`current`, `max`, `label`, `showValues`) |
| "Not available yet" page | `@/components/gates/LockedPage` |
| Phase-gated route | `@/components/gates/PhaseGate` |
| Auth-gated route | `@/components/auth/ProtectedRoute` · `RequireAdmin` |
| Nav link with active state | `@/components/NavLink` |
| Toast | `import { toast } from "sonner"` — the dominant choice in this repo (23 call sites vs 4 legacy `use-toast`). Use sonner in new code |
| Chart | `@/components/shared/ChartContainer` · `ui/chart` |
| Sidebar | `ui/sidebar` (full shadcn sidebar) · `@/components/galaxy/AppSidebar` |
| Everything else | `src/components/ui/*` — accordion, alert, alert-dialog, avatar, badge, button, calendar, card, checkbox, dialog, drawer, dropdown-menu, form, input, label, pagination, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle, tooltip … |

`Button`, `Card` and `Badge` are **stock shadcn**. The GSAT character is not in the primitive — it
is in how instances are composed (§4). Do not edit the primitives.

---

## 4. Page and card patterns

Copy-paste-ready versions with real code: **`reference/patterns.md`**.

**Page skeleton** — every student-facing page follows it:

```tsx
<div className="min-h-screen bg-background">
  <div className="container mx-auto px-4 py-8">
    {/* header: tinted icon tile + title + subtitle, action on the right */}
    {/* content sections separated by mb-8 */}
  </div>
</div>
```

**Page header** — tinted icon tile, responsive title, subtitle hidden on the smallest screens:

```tsx
<div className="mb-8 flex items-center justify-between gap-2">
  <div className="flex items-center gap-3 min-w-0">
    <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
      <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
    </div>
    <div className="min-w-0">
      <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">標題</h1>
      <p className="text-sm md:text-base text-muted-foreground hidden sm:block">副標題</p>
    </div>
  </div>
  {/* optional right-hand action */}
</div>
```

**The signature card** — a soft two-colour tint at `/10` with a matching `/20` border. This is the
site's most recognisable device. The established trio, in order:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
  <Card className="p-6 bg-gradient-to-br from-primary/10   to-accent/10   border-primary/20">   {/* 1st */}
  <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20"> {/* 2nd */}
  <Card className="p-6 bg-gradient-to-br from-accent/10    to-treasure/10 border-accent/20">    {/* 3rd */}
</div>
```

Inside: icon + `font-semibold` heading on one row (Badge optional on the right) → a big number with
a small unit beside it (`flex items-baseline gap-2`) → `ProgressBar` → one `text-sm
text-muted-foreground` line.

**Interaction:** `transition-all duration-300 hover:shadow-lg hover:-translate-y-1`, or the
`.hover-lift` utility. Clickable small things use `.hover-scale`.

---

## 5. States — the house idioms

**Loading** — centred spinner in a Card:

```tsx
<Loader2 className="h-12 w-12 animate-spin text-primary" />
```
Use `Skeleton` where content shape is known (see `src/pages/Blog.tsx`).

**Empty** — never a blank area. Always a reason *and* a next step:

```tsx
<div className="text-center py-12 text-muted-foreground">
  <p>尚未新增任何單元</p>
  <p className="text-sm mt-2">點擊「新增單元」按鈕開始建立課程內容</p>
</div>
```

**Error** — `Alert` with `variant="destructive"`, or the `.state-error` utility, or
`toast.error(...)` for transient failures.

**Success** — `toast.success(...)`; for inline confirmation, `.state-success`.

**Disabled** — the Button primitive already handles it
(`disabled:pointer-events-none disabled:opacity-50`). Never hand-roll disabled styling.

⚠️ **Token gotcha.** `--info`, `--success-bg`, `--warning-bg` and `--info-bg` exist in `index.css`
but are **not** mapped in `tailwind.config.ts`. `bg-info` and `bg-success-bg` do not exist. Use
`bg-success/10`, `bg-warning/10`, or the `.state-success` / `.state-error` utilities.
`treasure`, `explorer` and `map` are single colours with **no** `-foreground` pair.

---

## 6. Responsive

Mobile-first; `md:` is the hinge. Container padding is already responsive
(`1rem → 1.5rem → 2rem`); use `container mx-auto px-4` and let it work.

| Idiom | Use |
|---|---|
| `grid-cols-1 md:grid-cols-3` | stat rows |
| `text-2xl md:text-4xl`, `h-6 w-6 md:h-8 md:w-8` | size steps |
| `hidden sm:inline` / `hidden md:block` | drop secondary text on small screens |
| `min-w-0` + `truncate` | any text that can overflow a flex row |
| `shrink-0` | icons and badges next to flexible text |
| `Sheet` | the mobile nav pattern — see `Navbar.tsx` |

🛑 A horizontal scrollbar on the page body is a bug. Wide tables scroll inside their own
`overflow-x-auto` container.

---

## 7. Required checklist — run before calling any UI task done

Every item, every time. If one fails, fix it before reporting completion.

- [ ] **Visual hierarchy** — the most important thing on screen is the most prominent
- [ ] **Spacing consistency** — `p-6` cards, `gap-4`/`gap-6` grids, `mb-8` sections; no stray values
- [ ] **Alignment** — shared baselines and edges; icon+text pairs vertically centred
- [ ] **Typography** — sizes from §1; no new size or weight; no manual `font-display` on headings
- [ ] **Component reuse** — nothing rebuilt that §3 already provides
- [ ] **Responsive** — checked at mobile and desktop widths, both finished
- [ ] **Overflow** — long Chinese strings, long names, big numbers: `min-w-0` + `truncate`; no
      horizontal page scroll
- [ ] **hover / focus / disabled** — present, and focus is keyboard-visible
- [ ] **loading / empty / error / success** — all four exist, using §5's idioms
- [ ] **Design-token compliance** — no hex, no `bg-gray-*`, no arbitrary values, no new font,
      no new radius or shadow; dark mode intact
- [ ] **Does it look like it belongs to this site?** — put it beside `/practice/vocabulary`. If it
      reads as a different product, it is not done

---

## 8. Scope note

This skill governs **appearance and composition**. It does not authorise database, RLS, or backend
changes — `/learn` backend rules live in `docs/BACKLOG.md` and
`docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md`. 🛑 The `/exam` domain is reserved: do not restyle it.
