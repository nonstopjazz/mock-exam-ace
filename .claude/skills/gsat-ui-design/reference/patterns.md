# GSAT UI — copy-paste patterns

Every snippet below is extracted from code that is **already live on this site**. The file path after
each heading is the original. Prefer copying from here over inventing.

---

## Page shell

`src/pages/practice/VocabularyHub.tsx`

```tsx
<div className="min-h-screen bg-background">
  <div className="container mx-auto px-4 py-8">
    {/* header */}
    {/* sections, separated by mb-8 */}
  </div>
</div>
```

With nav and footer, wrap in `Layout` instead — `src/components/layout/Layout.tsx`:

```tsx
<Layout>
  <div className="container mx-auto px-4 py-8">…</div>
</Layout>
```

---

## Page header with action

`src/pages/practice/VocabularyHub.tsx`

```tsx
<div className="mb-8">
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
        <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">單字複習中心</h1>
        <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
          選擇你的複習模式，開始今天的學習
        </p>
      </div>
    </div>

    <Button
      variant="ghost"
      size="sm"
      className="gap-1 md:gap-2 text-muted-foreground hover:text-foreground shrink-0"
      onClick={() => navigate("/practice/vocabulary/collections")}
    >
      <Package className="h-5 w-5" />
      <span className="hidden md:inline">單字收藏包</span>
      <Badge variant="secondary" className="text-xs ml-1">{userPacks.length}</Badge>
      <ChevronRight className="h-4 w-4 hidden md:block" />
    </Button>
  </div>
</div>
```

Note the four responsive devices: `min-w-0` + `truncate` on the text column, `shrink-0` on the icon
tile and the action, `hidden md:inline` on the button label, and a smaller icon tile on mobile.

---

## The stat trio — the site's signature block

`src/pages/practice/VocabularyHub.tsx`

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

  <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">今日建議複習</h3>
      </div>
      <Badge variant="default">今日目標</Badge>
    </div>
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-foreground">{value}</span>
        <span className="text-muted-foreground">個單字</span>
      </div>
      <ProgressBar current={learned} max={total} showValues={false} />
      <p className="text-sm text-muted-foreground">已學習 {learned} / {total.toLocaleString()}</p>
    </div>
  </Card>

  {/* 2nd: from-secondary/10 to-explorer/10 border-secondary/20, icon text-secondary */}
  {/* 3rd: from-accent/10    to-treasure/10 border-accent/20,   icon text-accent    */}

</div>
```

**The recipe:** tint pair at `/10`, border at `/20`, icon in the leading colour, `mb-4` between the
heading row and the body, `space-y-2` inside the body, big number + small unit on a shared baseline,
progress, one muted caption. Keep the colour order — users have learned it.

---

## Reusable stat tile

`src/components/galaxy/StatCard.tsx` — use this instead of hand-building a small tile:

```tsx
<StatCard icon={Award} label="總複習次數" value={1234} subtitle="本週 +56" variant="treasure" />
```

`variant`: `default` (plain card) · `treasure` (primary→accent tint) · `explorer` (secondary→explorer
tint). It already carries `hover:shadow-lg hover:-translate-y-1`.

---

## Progress bar

`src/components/galaxy/ProgressBar.tsx`

```tsx
<ProgressBar current={7} max={10} label="本週進度" />          {/* shows "7 / 10" */}
<ProgressBar current={72} max={100} showValues={false} />      {/* bare bar, h-3 */}
```

---

## Sticky navigation

`src/components/layout/Navbar.tsx`

```tsx
<nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
  <div className="container mx-auto flex h-16 items-center justify-between px-4">
    {/* logo · desktop links · user status · mobile Sheet trigger */}
  </div>
</nav>
```

Desktop links: `text-sm font-medium text-muted-foreground transition-colors hover:text-primary`,
active state `text-primary` via `NavLink`'s `activeClassName`. Mobile: a `Sheet`. Every link pairs a
`lucide-react` icon at `h-4 w-4` with its label.

---

## Loading

`src/pages/ClaimPack.tsx`

```tsx
<Card className="max-w-md mx-auto">
  <CardHeader className="text-center">
    <div className="mx-auto mb-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
    <CardTitle>載入中...</CardTitle>
    <CardDescription>請稍候</CardDescription>
  </CardHeader>
</Card>
```

Inline, inside a button: `<Loader2 className="h-4 w-4 animate-spin" />` and `disabled`.

Skeleton, where the shape is known — `src/pages/Blog.tsx`:

```tsx
<Skeleton className="h-48 w-full rounded-lg" />
```

---

## Empty

`src/pages/practice/CourseEdit.tsx`

```tsx
{items.length === 0 ? (
  <div className="text-center py-12 text-muted-foreground">
    <p>尚未新增任何單元</p>
    <p className="text-sm mt-2">點擊「新增單元」按鈕開始建立課程內容</p>
  </div>
) : (
  …
)}
```

A larger empty state adds an icon above: `<Play className="h-12 w-12 text-muted-foreground mx-auto" />`.

**Always two lines:** what is missing, then what to do about it.

---

## Centred single-card page

`src/components/gates/LockedPage.tsx` — the template for confirmation, gate and outcome screens:

```tsx
<div className="container mx-auto px-4 py-20">
  <div className="mx-auto max-w-md">
    <Card className="text-center">
      <CardHeader>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="text-2xl">功能即將推出</CardTitle>
        <CardDescription className="text-base">此功能目前尚未開放，敬請期待！</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full"><BookOpen className="mr-2 h-4 w-4" />主要動作</Button>
        <Button variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />返回上一頁</Button>
      </CardContent>
    </Card>
  </div>
</div>
```

Note `py-20` (not `py-8`) for a centred single-card page, `max-w-md`, the circular `bg-muted` icon
well, and stacked full-width buttons with the primary action first.

---

## Toast

```tsx
import { toast } from "sonner";

toast.success("已儲存");
toast.error("儲存失敗，請稍後再試");
```

---

## Utilities defined in `src/index.css`

| Class | Effect |
|---|---|
| `.hover-scale` | `hover:scale-105 active:scale-95`, 200ms — small clickable things |
| `.hover-lift` | `hover:-translate-y-1 hover:shadow-lg`, 300ms — cards |
| `.glass` | `bg-background/80 backdrop-blur-lg` — ⚠️ used sparingly; not a decoration |
| `.gradient-text` | primary→accent clipped text — headline accents only |
| `.state-success` / `.state-error` | tinted bg + text + border for inline states |
| `.text-balance` | `text-wrap: balance` for headings |

## Animations available (`tailwind.config.ts`)

`fade-in` · `fade-out` · `scale-in` · `scale-out` · `enter` · `exit` · `bounce-in` · `slide-in-right`
· `slide-out-right` · `shake` (wrong answer) · `float` · `pulse-glow` · `shine` ·
`accordion-down` / `accordion-up`

Use one of these before writing a new keyframe. Entrances are `animate-fade-in` or `animate-enter`;
celebration moments use `bounce-in`; `shake` already means "wrong answer" on this site — don't
repurpose it.

---

## Icon sizing

| Context | Size |
|---|---|
| Inside a button, nav link, inline label | `h-4 w-4` |
| Section / card heading | `h-5 w-5` |
| Stat icon, page header on mobile | `h-6 w-6` |
| Page header on desktop | `h-8 w-8` |
| Empty state, loading, gate screens | `h-12 w-12` |

Buttons place icons with `mr-2` (leading) or rely on the primitive's built-in `gap-2`.
