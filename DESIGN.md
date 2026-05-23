# DESIGN.md — Fulcrum

> Visual + interaction system grounded in a local research-dossier set + 1281-entry PRD glossary (both kept locally, not tracked). Drives every web / CLI / TUI / desktop surface. Pairs with [PRODUCT.md](PRODUCT.md).

---

## 0. Posture

- **Register:** product (per [impeccable/reference/product.md](~/.claude/skills/impeccable/reference/product.md)). Design serves the workbench.
- **Vibe target:** Linear density + k9s status-spine + Plane multi-layout view ergonomics + Plannotator review surface + ACP-UI protocol clarity. Not Notion cream, not Jira ribbons, not crypto neon.
- **Scene sentence (drives theme + density):** *Operator at a 27-inch monitor at 1am, switching between web shell + terminal, supervising five agents in parallel runs, glancing at trace IDs to cross-reference audit. Room is dim. Brightness is low. Eye fatigue is real. Density must not shout.*
- That sentence forces a **dark-leaning theme with explicit light theme parity** (system colors flip; no theme baked into chrome), a calm one-accent palette, and a status-rich semantic vocabulary.

---

## 1. Foundation — design tokens

Source: local research-06 §5 (mobile / a11y / perf / tokens dossier).

### 1.1 Format

- W3C Design Tokens Community Group JSON shape at `tokens/fulcrum.tokens.json`.
- Compiled to Tailwind v4 `@theme` block at `apps/web/src/app.css`.
- OKLCH everywhere. Sentry semantic role names. Apple-style layered surfaces. Material 3 `on-*` pairing.

### 1.2 Color roles (semantic, never raw)

| Role | Light | Dark | Use |
|---|---|---|---|
| `surface` | `oklch(0.99 0.002 270)` | `oklch(0.14 0.005 270)` | Page background |
| `surface-elevated` | `oklch(1.00 0.000 270)` | `oklch(0.18 0.005 270)` | Cards, popovers, panels |
| `surface-sunken` | `oklch(0.97 0.003 270)` | `oklch(0.11 0.005 270)` | Sidebar, footer, code blocks |
| `surface-overlay` | `oklch(0.99 0.002 270 / 0.92)` | `oklch(0.14 0.005 270 / 0.92)` | Modal backdrops, drawer scrim |
| `fg` | `oklch(0.18 0.01 270)` | `oklch(0.96 0.005 270)` | Primary text |
| `fg-subtle` | `oklch(0.42 0.01 270)` | `oklch(0.72 0.005 270)` | Secondary text, labels |
| `fg-muted` | `oklch(0.58 0.01 270)` | `oklch(0.66 0.005 270)` /* bumped 0.62 → 0.66 to clear 0.45 lightness-delta heuristic against --surface-sunken (oklch 0.175). 2026-05-18. */ | Tertiary, captions, hints |
| `fg-disabled` | `oklch(0.72 0.01 270)` | `oklch(0.38 0.005 270)` | Disabled controls |
| `fg-inverse` | `oklch(0.99 0.002 270)` | `oklch(0.14 0.005 270)` | Text on accent fills |
| `border` | `oklch(0.90 0.005 270)` | `oklch(0.28 0.005 270)` | Default borders |
| `border-strong` | `oklch(0.78 0.005 270)` | `oklch(0.42 0.005 270)` | Stronger separators |
| `border-focus` | `oklch(0.62 0.18 250)` | `oklch(0.72 0.18 250)` | Focus rings |
| `accent` | `oklch(0.62 0.18 250)` | `oklch(0.72 0.18 250)` | Primary action, current selection |
| `accent-hover` | `oklch(0.56 0.20 250)` | `oklch(0.78 0.18 250)` | Hover |
| `accent-subtle` | `oklch(0.94 0.04 250)` | `oklch(0.24 0.06 250)` | Backgrounds for accent chips |
| `on-accent` | `oklch(0.99 0.002 250)` | `oklch(0.10 0.005 250)` | Text on accent fill |
| `danger` | `oklch(0.58 0.21 27)` | `oklch(0.68 0.21 27)` | Errors, destructive |
| `warn` | `oklch(0.78 0.16 80)` | `oklch(0.82 0.16 80)` | Degraded, warning |
| `success` | `oklch(0.64 0.16 145)` | `oklch(0.72 0.16 145)` | OK, complete, passed |

**Subtle + on- pair for every semantic** (danger / warn / success). Hue chosen to give Fulcrum one accent (cool blue at 250°). Accent never becomes a "brand" — never used decoratively. Only primary action, current selection, focus ring, state indicators.

### 1.3 Radius

| Token | Px | Use |
|---|---|---|
| `radius-xs` | 2 | Inline pills, tags |
| `radius-sm` | 4 | Buttons, inputs, table cells |
| `radius-md` | 6 | Cards, popovers, panels |
| `radius-lg` | 10 | Modals, drawer |
| `radius-xl` | 16 | Hero / landing only |

### 1.4 Spacing (8-px grid)

| Token | Px | Use |
|---|---|---|
| `space-0` | 0 | Reset |
| `space-1` | 4 | Inline gaps |
| `space-2` | 8 | Tight stack |
| `space-3` | 12 | Default stack |
| `space-4` | 16 | Section gap |
| `space-6` | 24 | Card padding |
| `space-8` | 32 | Major section |
| `space-12` | 48 | Large layout separation |
| `space-16` | 64 | Page-level band separation |

Tailwind v4 spacing utilities are driven from `apps/web/src/app.css` with `--spacing: 0.25rem`, so numeric utilities map to the documented 4px scale (`p-1` = 4px, `p-16` = 64px). The same file safelists the approved margin, padding, gap, and stack utilities with `@source inline(...)` so large tokens are available even before a page uses them. Web slices must use only `0/1/2/3/4/6/8/12/16` spacing utilities for margin, padding, gap, and stack spacing unless a safe-area or viewport-specific CSS expression is explicitly required.

Row height baseline = 24 px (research-01 §13). Tables 28 px comfortable / 24 px cozy / 20 px compact via density toggle.

### 1.5 Breakpoints

From research-06 §6 plus Fulcrum-specific `xs`. Tailwind v4 breakpoints are declared in `apps/web/src/app.css` under `@theme` as `--breakpoint-*` tokens; `MOBILE_QUERY` derives from the `md` threshold and stays `(max-width: 767px)`.

| Name | Min width | Use |
|---|---|---|
| `xs` | 30rem (480) | Phone portrait → single column |
| `sm` | 40rem (640) | Phone landscape |
| `md` | 48rem (768) | Tablet portrait → 2-pane optional |
| `lg` | 64rem (1024) | Tablet landscape / laptop → 3-pane default |
| `xl` | 80rem (1280) | Desktop → full IA |
| `2xl` | 96rem (1536) | Wide desktop → max content width caps |

Container queries (`@container`) mandatory for: board cards, run-feed entries, doc-table rows, sidebar widgets, command palette result rows.

### 1.6 Reduced motion + forced colors

Global guards (research-06 §2, §5):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}

@media (forced-colors: active) {
  :root {
    --color-border: CanvasText;
    --color-border-focus: Highlight;
  }
  button, [role="button"] {
    border: 1px solid ButtonText;
  }
}
```

---

## 2. Typography

System font stack ([impeccable/reference/product.md](~/.claude/skills/impeccable/reference/product.md)):

```css
font-sans:  "Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
font-mono:  "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

**One family carries everything** — Inter Variable for UI; monospace with Fira Code fallback for trace IDs, code blocks, status footer, JSON output.

### 2.1 Scale (semantic rem tokens)

| Token | Size | Line | Weight | Use |
|---|---|---|---|---|
| `type-display` | 40px (2.5rem) | 1.2 | 600 | Large marketing-free page display only |
| `type-h1` | 32px (2rem) | 1.3 | 600 | Page title |
| `type-h2` | 24px (1.5rem) | 1.4 | 600 | Section title |
| `type-h3` | 20px (1.25rem) | 1.4 | 600 | Card or panel title |
| `type-body` | 16px (1rem) | 1.5 | 400 | Default body |
| `type-caption` | 14px (0.875rem) | 1.4 | 500 | Captions, labels, metadata, badge text |
| `type-code` | 14px (0.875rem) | 1.6 | 400 | Trace IDs, code, JSON, shell snippets |

Body line length 65–75ch in prose surfaces (doc editor). Tables, run feed, audit log: dense (120ch+ ok).

Tailwind v4 token source lives in `apps/web/src/app.css`: `--text-display`, `--text-h1`, `--text-h2`, `--text-h3`, `--text-body`, `--text-caption`, `--text-code`, plus paired `--text-*--line-height` values. Use semantic `type-*` classes for hierarchy; do not introduce raw `text-lg`, `text-xl`, or `text-2xl` hierarchy classes in new UI slices. Letter spacing stays `0` per UI quality rule; hierarchy comes from size, line-height, and weight.

### 2.2 Weights

400 / 500 / 600 only. No 700 in UI (reserve for in-doc prose emphasis).

---

## 3. Layout

### 3.1 Chrome layout (web, desktop ≥ lg)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ SCOPE BAR  brand · ws · stage tabs · trace · ⌘K · 🔔 · ⚙ · ? · avatar              │ 48px
├──────────────┬───────────────────────────────────────────────────┬─────────────────┤
│              │                                                   │                 │
│  STAGE NAV   │            STAGE CONTENT                          │  AI ASSIST      │
│  (Capture)   │   (board / doc / runs / review / artifacts)       │  (overlay, ⌘/)  │
│   Plan       │                                                   │  agent picker   │
│   Build      │                                                   │  step context   │
│   Review     │                                                   │  live thread    │
│   Ship       │                                                   │  trace badge    │
│   Operate    │                                                   │  ▶ Send         │
│  ─────       │                                                   │                 │
│   Settings   │                                                   │                 │
│   Knowledge  │                                                   │                 │
│   MCP        │                                                   │                 │
│   Plugins    │                                                   │                 │
├──────────────┴───────────────────────────────────────────────────┴─────────────────┤
│ STATUS FOOTER  mode·profile·branch·run x/y·agent·mcp···trace·time·?·⌘K·✨ AI Assist│ 44px
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Scope bar 48 px desktop / 56 px mobile** (lifted from 32/40 — small chrome read as outdated; Linear / Vercel / GitHub sit ~48 px).
- Stage nav rail collapsed = 56 px (icons only) / expanded = 220 px (label).
- **Status footer 44 px desktop** (compact 38 / comfortable 50; mobile 64 px), fixed bottom. **TUI status footer mirrors this exactly** (research-05 §3.6).
- **AI Assist drawer (formerly "ACP chat") is overlay-style, not push**: slides over content with a dimmed/blurred backdrop (Cloudflare AI Assistant pattern). 420 px desktop, 92vw mobile; opens via `⌘/`, the right-most footer segment, or backdrop click closes it.
- The AI Assist entry point lives in the **status footer** (right-most segment, accent left-border, ✨ icon + label + `⌘/` kbd), not the scope bar. The scope bar's right cluster is for system chrome (palette · notifications · display settings · keyboard help · avatar) — see PRODUCT.md §"Scope Chrome" for the popovers each one opens.

### 3.2 Mobile chrome (`<md`)

- Scope bar 56 px — workspace chip on left, active-stage chip + notifications + account on right.
- Stage nav becomes a **bottom tab bar**: 6 stage icons + AI Assist tab (right-most, accent-tinted; tab grid `repeat(6, 1fr) auto`).
- AI Assist drawer → bottom sheet 60vh default, draggable, opened from the AI Assist tab or `⌘/`.
- Status footer hidden; trace ID accessible via swipe-down quick panel.

### 3.3 Stage content layouts

Five canonical content shapes used across stages:

1. **List + Detail (peek-overview).** Left list (320 px) + right detail (flex). Click row = peek modal slides over without changing route (research-07 §1.3). Used: tasks, runs, artifacts, audit.
2. **Multi-layout grid.** View switcher (board / list / table / calendar / gantt) over same data set. Used: tasks (Build), reviews (Review). Verbatim Plane shape.
3. **Editor surface.** Tree (240 px) + editor (flex) + backlinks rail (collapsible 280 px). Used: docs (Capture), plans (Plan). Document delete opens an inline impact preview before the action: child pages, backlinks, attachments, ContextBundles, and artifacts. Soft-deleted Documents disappear from the normal PageTree and remain in a reachable trash view. Restore targets the original parent when it still exists, otherwise asks for a new destination. Permanent delete requires elevated permission and typed title confirmation.
4. **Live session pane.** Sessions list (220 px) + transcript (flex) + workspace dock (320 px, tabs: Shell · Files · Browser · Plan · Cost). Sticky plan strip at top of transcript (research-02 § Web Live Session Pane). Used: ACP planning (Plan), agent runs (Build).
5. **Subsystem table.** Full-width table with inline expand. Used: doctor (Operate), audit (Ship), error logs (Operate).

Lists or tables that can exceed 100 rows MUST use TanStack Virtual instead of rendering the full dataset. The standard row contract is a stable or estimated 48 px row, `overscan: 10`, preserved selection state outside the rendered window, and a jump-to-row API for deep navigation. Virtualized rows must expose deterministic `data-row-index`/selection attributes in design E2E and must not render blank placeholders or shift height while scrolling.

---

## 4. Components — vocabulary

Built on **Bits UI** primitives (Svelte 5, WAI-ARIA APG, focus management) — research-06 §2.

### 4.1 Buttons

| Variant | Use | Style |
|---|---|---|
| `primary` | Page-level main action; one per surface | `bg-accent fg-on-accent` |
| `secondary` | Default | `bg-surface-elevated border` |
| `ghost` | Inline, tertiary | No bg until hover |
| `danger` | Destructive | `bg-danger fg-on-danger` |
| `link` | Inline navigation | Underline on hover |

Sizes: `xs` 20px, `sm` 24px, `md` 28px (default), `lg` 32px. Always 24×24 px hit-area minimum (WCAG 2.5.8). 40×40 under `(pointer: coarse)`.

States required on every variant (research / impeccable product.md):
- default · hover · focus-visible · active · disabled · loading · selected

### 4.2 Forms

- Input height 28 px (matches button md).
- Label 12 px above, fg-subtle.
- Error message inline below, 11 px danger color, prefixed by `!` icon.
- Required marker `*` as a separate node, never inline in label text.
- Help text 11 px fg-muted.
- Validation: blur on first interaction, debounced (300 ms) on subsequent edits.
- Field variants cover `text`, `email`, `password`, `number`, `url`, `tel`, `search`, `date`, `time`, `datetime-local`, and `textarea`. Missing native type coverage is a design-system bug.
- Block label layout is default. Compact inline layout uses a left label track capped at 200 px, with the control taking remaining width.
- State styling: default uses `border-input`; focus-visible uses `ring-ring`; error sets `aria-invalid=true`, `border-destructive`, danger label/message; success uses `border-success` plus check icon; disabled uses `bg-muted`, `fg-disabled`, and `cursor-not-allowed`.
- Error/success captions live below the field and connect through `aria-describedby`. Placeholder text never replaces a visible label.
- Textarea supports `min-height`, `max-height`, resize-y, `maxlength`, and a visible character counter below the control.

#### Task Quick Create

- Task quick create is an inline tray, never a modal-first flow. It preserves the current board, backlog, table, or planning scope while the user fills the task title.
- Required project/scope is visible before submit. Sprint, module, and cycle assignment fields remain visible and editable before submit.
- Empty-title validation, duplicate prevention, and submit failure keep the typed draft and all assignments intact.
- Recurring task setup must show a plain-language preview of generated instances before submit.

#### Project Label Settings

- Label settings show hierarchy, color, usage count, archived state, and persisted order in one scannable list.
- Archive is the default removal action. Archiving a parent must move active children to root instead of deleting or hiding them.
- Permanent cleanup is only a bulk archived-label action. It must show selected archived rows and block labels with linked usage.
- Color choices must pass contrast against the settings background; color alone never carries label meaning.
- On mobile, the tray stays in the page flow with 40 px minimum controls and no horizontal overflow; failure recovery uses an inline retry action, not a new overlay.

### 4.3 Tables

Verbatim Plane spreadsheet shape (research-07 §1.3) + Linear density.

- 24 px row height (cozy default), 20 px compact, 28 px comfortable.
- Sticky header. Resizable + reorderable columns. Sort indicator on hover, persistent when active.
- View sort controls expose every displayed sortable field as a table-header button on desktop and as a visible field/direction menu on mobile. First activation sorts ascending; repeated activation toggles descending; active field and direction stay visible in the header and `aria-sort`.
- Row selection: checkbox left, `space` to toggle, `shift+click` for range, `cmd+a` for all visible.
- Bulk-action bar appears as a 32 px ribbon above the table when any row selected.
- Per-row peek: click anywhere outside selectable cells = peek-overview modal.

### 4.4 Cards (board view)

- Min height 80 px, padding `space-3`.
- Status badge (top-right), title (line 1, fg, 13 px), meta row (fg-subtle 11 px), avatar stack (right), per-step modes row (bottom).
- Drag-and-drop: native HTML5 + keyboard fallback (`space` to grab, `j/k/h/l` to move, `enter` to drop, `esc` to cancel — research-06 §2 WCAG 2.5.7).
- Container query: cards collapse to single-line on `<320 px` width inside narrow panes.

### 4.5 Tool-call card (research-02, ACP)

Verbatim ACP `tool_call` shape. Each card:

```
┌──────────────────────────────────────────────────────┐
│ ▶ tool name           status-badge      copy ⧉  expand│
│   summary one-liner                                   │
├──────────────────────────────────────────────────────┤
│   (expanded) args block (json, syntax-highlighted)    │
│   (expanded) result block + diff if file edit         │
└──────────────────────────────────────────────────────┘
```

- Status badges: `pending` (slate), `in_progress` (accent + spin), `completed` (success), `failed` (danger).
- Copy buttons per block (args, result, full call as shell when applicable).
- Diffs render inline per-file with `a` accept / `r` reject / `h` next-hunk keyboard.

### 4.6 Inline diff

Per Plannotator review-editor (research-07 §4.2). Two-pane (split) or unified, toggle in toolbar. Per-hunk accept/reject. Syntax highlight via Shiki (lazy-loaded chunk). Line numbers always on. Word-level diff for ≤200 char hunks.

### 4.7 Modal vs sheet vs drawer (decision tree)

| Surface | Use when | Width |
|---|---|---|
| **Inline overlay** | < 5 fields, no nav, < 5s task | n/a |
| **Side drawer (right)** | Persistent context (AI Assist), overlay slide-in with backdrop, survives nav | 420 px desktop / 92vw mobile |
| **Peek modal** (Plane peek-overview) | Quick read of one entity, single click to dismiss | 720 px centered |
| **Sheet (mobile)** | Mobile equivalent of drawer / peek modal | full width × 60vh draggable |
| **Confirm modal** | Irreversible action only | 400 px centered |
| **Full modal** | Multi-step workflow that needs focus (rare) | 800 px centered |

Hard ban: two modals open at once. Sheets stack into drawer.

Skill install conflicts use the full modal pattern because resolution is a focused multi-option workflow. The modal must name the installed skill/version, requested skill/version, incompatibility reason, recommended path, alternative-version select, skip action, upgrade-installed-first action, and force action only when the compatibility check marks it safe. The same state is covered in `/design-kit` under `data-design-kit-section="skill-conflict-dialog"` before production routes consume it.

### 4.8 Empty state

Per research-01 §9. Universal template:

```
[icon, 24px, fg-muted]

One sentence naming the next workflow action.

[ Primary button: do the action ]   Press C to do it via keyboard.
```

No illustrations. No marketing copy. No nested suggestion cards.

### 4.9 Status badge vocabulary (universal)

| State | Color | Icon | Use across surfaces |
|---|---|---|---|
| `pending` | slate | `circle-dashed` | Queued, not started |
| `running` / `in_progress` | accent (pulse) | `dot` pulsing | Live work |
| `complete` / `ok` / `passed` | success | `check` | Done well |
| `blocked` / `awaiting` | warn | `clock` | Needs input |
| `failed` / `error` | danger | `x` | Bad outcome |
| `cancelled` / `archived` | fg-muted | `slash` | Inactive |
| `degraded` | warn | `triangle` | Partial fail |
| `unknown` | fg-muted | `?` | Pre-probe |

Five-state pattern from Healthchecks (research-04 §13). Color + icon + text — never color alone (WCAG 1.4.1).

### 4.10 Trace-ID badge (research-04 §16)

The single most important cross-surface identity primitive. Identical visual identity across web / CLI / TUI.

**Web spec (pixel-accurate):**
- Height 24px, mono font, 12px text, 8px horizontal padding.
- Background `surface-sunken`, border `border`, radius `sm`.
- Content: `trace:` prefix (fg-subtle, 11px) + 8-char hex prefix of trace_id (fg, 12px mono) + `…` ellipsis.
- Click copies full 32-char hex. Hover tooltip: full ID + project + cycle + timestamp.
- Right-click → "Open in audit", "Open in CLI" (writes `fulcrum trace show <id>` to clipboard).

**CLI spec:** every `--json` envelope carries `{ trace_id, span_id, run_id, project_id, ts }` at top level. Plain-text mode header line: `trace: 4f3a1c9e…  run: 01HXYZ…  project: fulcrum`.

**TUI spec:** status-footer segments `[trace:4f3a1c9e]  [run:01HXYZ]  [span:8b2d4a6f]` mono, segments keybind-copyable (`y t / y r / y s`).

### 4.11 Per-step mode affordance row

Universal — on every step header (task card, doc block, review item, artifact row, subsystem row, audit row):

```
[step title] ............... ▶ Play   💬 Discuss   ⋮ More   ⊞ Drawer
```

- ▶ Play 24px primary action button. Click → **mode picker popover**: lists every configured CLI agent (claude-code · codex · gemini-cli · opencode · pi-cli · …), with the default-routed agent for this action kind marked, plus `+ Pick another agent…` and a `workflow` icon shortcut to `Settings → Default routes` for setting the agent for that action kind. Below the agent list: policy (Ask on write / Auto / Read-only), `Play` + `Preset` buttons. Run streams inline below the step.
- 💬 Discuss 24px secondary. Opens inline thread anchored to the step.
- ⊞ Drawer pulls right-side AI Assist drawer scoped to this step. The drawer's header carries the agent picker — switching agents mid-thread keeps history per agent.
- ⋮ More: clone / archive / change owner / lock for review.

Keyboard: `p` Play / `d` Discuss / `⌘/` drawer / `c` clone (on focused row).

### 4.13 Mode affordance row

Universal per-step affordance, rendered in three forms depending on density and context. All forms use `role="toolbar" aria-label="Step modes"` and the canonical CSS classes `.mode-row`, `.mode-row.compact`, `.mode-row.tight`, `.mode-btn`, `.mode-btn.assist`.

- **Long** (per-card / per-row primary): all 4 buttons with labels: `✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist`.
- **Compact** (dense lists, board cards, timeline lanes): icon-only `✋ ▶ 💬 ⊞`, 24×24 min target size.
- **Tight** (settings rows, doc surfaces where Manual/Assist would be noise): `▶ Suggest / 💬 Discuss` only.

### 4.14 Skip-link

`<a href="#main" class="skip-link">Skip to content</a>` immediately after `<body>` on every top-level page. CSS: off-screen by default, on `:focus` jumps to `left: 16px; top: 8px; z-index: 1000; padding: 8px 14px; background: var(--surface-elevated); border: 1px solid var(--accent); color: var(--accent);`.

### 4.15 Empty-state pattern

Container with `data-state="empty"` toggles between list view and empty-state block. CSS: `:where([data-state="empty"]) .list { display: none; } :where([data-state="empty"]) .empty-state { display: block; }`. Empty-state shape: H2 (what's missing) + paragraph (why + next step) + 1-2 action buttons.

### 4.16 Agent avatar

Flat `color-mix(in oklch, var(--<role>) 18%, var(--surface))` background + monogram letter in `var(--fg)`, `font-weight: 600`. NO gradients. Roles map: `cl` (Claude) → `--accent`, `gp` (general-purpose) → `--success`, `ge` (Gemini) → `--info` (fall back to `--accent`), `oc` (OpenCode) → `--warn`, `pi` (Pi) → `--purple`, `cx` (Codex) → `--danger`.

### 4.12 Command palette (`⌘K`)

Per research-01 §12 and research-07 §1.6 (Plane Power-K). Context-aware, stateful menus.

- Top section: recent (4 items).
- Sections: workflow stage navigation (`Go to Plan`, `Go to Review`, …), project switcher, federated search (docs/tasks/runs/artifacts), settings search, **▶ Play current step**, **💬 Discuss current step**, theme + workspace switch.
- Context detector reads route + active step to swap command set.
- Header chip shows active scope so menu never ambiguous (improvement over Plane).
- Esc closes. Returns to where you were.
- Plain keyboard nav only. Mouse optional.

---

## 5. Motion

- 150–250 ms on every interaction (research / impeccable product.md).
- Ease-out cubic-bezier `(0.16, 1, 0.3, 1)` (ease-out-quart) for most transitions. No bounce.
- **Banned:** decorative motion, page-load orchestration, gradient sweep, glow pulse > 1.5s cycle.
- **State-change motion:** drawer slide (200 ms), modal scale-in 0.96 → 1.0 + opacity (180 ms), peek-overview lift (180 ms), tooltip fade (120 ms), toast slide-in from bottom-right (180 ms).
- **Streaming motion:** run-feed line slide-in from top (120 ms), tool-call card expand (150 ms), permission prompt slide-in inline (200 ms).
- **`prefers-reduced-motion: reduce`** collapses every animation and transition to an effectively instant, single-iteration state; parallax and decorative autoplay are disabled (research-06 §2).

> **Reduced-motion guarantee.** Every animated/transitioned property MUST inherit `@media (prefers-reduced-motion: reduce)` overrides. Implementation: `* { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; transition-delay: 0ms !important; }` inside the media query. `scroll-behavior: auto;` on `html` when reduced motion is preferred. Parallax layers use `data-parallax-layer` and are forced to `transform: none`; decorative autoplay loops use `data-autoplay-loop` and are paused.

---

## 6. Iconography

Lucide for the entire UI (research-01 §13). One icon per concept. Stroke 1.5 px, size 16 / 20 / 24 px based on context. Never coloured arbitrarily — icons inherit `fg-subtle` by default; semantic colours only on status icons in badge contexts.

Critical concept → icon map (locked):

| Concept | Icon |
|---|---|
| Capture | `inbox` |
| Plan | `compass` |
| Build | `hammer` |
| Review | `eye` |
| Ship | `package` |
| Operate | `activity` |
| Project | `folder` |
| Doc | `file-text` |
| Task | `square-check` |
| Run | `play-circle` |
| Artifact | `archive` |
| Memory | `brain` |
| Inbox | `bell` |
| Trace | `link-2` |
| Drawer | `panel-right` |
| Play | `play` (filled) |
| Discuss | `message-square` |
| Search | `search` |
| Settings | `settings` |
| Doctor | `stethoscope` |

---

## 7. Density mode

Three modes (compact / cozy / comfortable). Settings → Display. Default = cozy.

| Token | Compact | Cozy | Comfortable |
|---|---|---|---|
| Body size | 12px | 13px | 14px |
| Row height | 20px | 24px | 28px |
| Card padding | 8px | 12px | 16px |
| Sidebar item height | 24px | 28px | 32px |

> **Tap targets.** Minimum 24×24 CSS pixels per WCAG 2.5.8. Icon-only `.mode-btn` honours this via `min-width: 24px; min-height: 24px;` even when the visible glyph is 16px.

---

## 8. Live session pane (verbatim spec)

Per research-02 § Web Live Session Pane. Used in Plan stage (ACP planning) and Build stage (agent runs).

```
┌──────┬──────────────────────────────────────────────────┬──────────┐
│ list │  sticky plan strip                                │ workspace │
│ (220)│ ─────────────────────────────────────────────────│ dock      │
│      │ transcript (flex)                                 │  Shell    │
│ sess │  - agent_message_chunk                            │  Files    │
│  1   │  - tool_call card (collapsed)                     │  Browser  │
│  2   │  - inline file diff (per-file accept/reject)      │  Plan     │
│  3*  │  - inline permission prompt                       │  Cost     │
│  4   │ ─────────────────────────────────────────────────│           │
│  …   │ composer (input + send + ▶ Play / 💬 Discuss)    │           │
└──────┴──────────────────────────────────────────────────┴──────────┘
                                                                ↓
                                              autoscroll-lock + "jump to bottom" button
```

- ACP `session/update` notifications drive transcript: `plan`, `agent_message_chunk`, `tool_call`, `tool_call_update`, `available_commands_update`, `current_mode_update` (research-02 §13).
- "Fork from this turn" action on every transcript row.
- Inline permission prompts (research-02 §10 + research-07 §5.4): one button per option, Cancel, never modal except for irreversible ops.
- Checkpoint timeline sits below active tool-call state in `AgentSessionWorkbench`: newest checkpoint uses inline **Resume from checkpoint**, older checkpoints open **Fork into new session?** confirmation. Rows show kind icon, label, turn index, created time, and current marker.
- Abort is irreversible: Web uses modal confirmation with reason dropdown (`user-cancel`, `dangerous-output`, `wrong-context`, `cost-cap`) plus required note. Copy says **AI Assist**, never protocol names.
- Pause queue indicator appears only while paused and shows queued prompt count beside the resume affordance; resume clears it through live session state.

---

## 9. Run feed + multi-agent orchestrator

Per research-02 § Web Run Feed + § Web Multi-Agent Orchestrator.

- Per-task vertical event timeline: columns time / kind / session / agent / summary / cost-delta.
- Filters: kind / session / agent / status. Saved views (Temporal pattern).
- Group-by `parent_tool_use_id` collapses subagent fan-outs.
- Inline "mark success / retry / terminate" verbs per row.

Orchestrator: left rail DAG (Sugiyama via research-07 §3.2), node colour = ACP status. Click node → swap centre pane to that run's Live Session Pane. Right rail = sticky cost + SLO panel.

### 9.1 Document Version Review

- Document history shows a selectable version timeline with author, timestamp, and change summary for each revision.
- Diffs use explicit Added/Removed text labels plus success/destructive tokens; color alone never carries meaning.
- Restore is never one-click. It requires an inline confirmation and records the resulting version/audit state after confirmation.
- Comments stay visible as a review thread, with add, resolve, empty, failed-save, and permission-denied states in the same surface.
- Backlinks include source context, not just titles, and the planning conversion action remains visible from history/detail contexts.

---

## 10. Doctor / audit / error logs

Per research-04 § Doctor / Audit / Error logs.

- **Doctor:** subsystem table, 5-state vocabulary, per-row Probe button, recovery copy-button, telemetry row mandatory.
- **Audit:** row `(timestamp, actor, action, target, outcome, source_event_id, trace_id, details)`, filter row above table, JSONL/NDJSON export.
- **Error logs:** Sentry fingerprint grouping `(error_type, top_user_frame, tool_name)`, drill-down with timeline + facet map + linked runs.

---

### 10.5 AI Assist segment identity (exception)

> The footer `.seg.assist` segment carries a subtle 4-8% accent-tinted vertical gradient + an inset top highlight + a radial accent glow at the leading edge. This is **the only place** glassmorphism / gradient is permitted decoratively. It serves as the cross-surface visual identity for the AI Assist surface; do NOT generalize.

---

## 11. Onboarding (first-run)

Per PRODUCT.md + research convergence (Linear empty cycle / Devin empty session):

1. Boot → workspace-name input (single field).
2. "What are you building?" → project created.
3. Capture screen opens with cursor on blank canvas.
4. First ▶ Play triggers a one-time coachmark.
5. First trace ID surface pulses once.

No multi-step wizard. No tooltip carousel. The interface teaches itself.

---

## 12. What we will not build

Codified anti-references from PRODUCT.md + research convergence:

- No SaaS cream gradients.
- No "✨ AI" sparkles or neon agent branding.
- No four-card metric grids.
- No modal-first task create.
- No coloured side-stripe borders.
- No gradient text.
- No default glassmorphism.
- No gradient agent-disc avatars.
- No hero illustrations.
- No persistent welcome banners after first session.
- No telemetry without opt-in (research-04 §14).
- No "you have unread items" guilt UI.

---

## 13. Cross-surface invariants

For every Fulcrum surface (web / CLI / TUI), the following must hold:

1. **Trace ID** visible + copyable (web badge / CLI envelope key / TUI footer segment).
2. **Project + stage** visible at chrome level (research-01 §5).
3. **Four-mode affordance** per step (manual / Play / Discuss / AI Assist drawer).
4. **Command palette** parity: `⌘K` web, `:` TUI, `fulcrum <verb>` CLI (research-05 §3.5).
5. **Status vocabulary** identical (eight states, same colour, same icon).
6. **Empty states** identical structure (one sentence + one action).
7. **Error copy** template: `[what failed]. [why, if non-obvious]. [exact next step]. trace=<id>`.
8. **AI Assist** reachable in one keystroke from anywhere (`⌘/` web, `⌘/` TUI, `fulcrum ai` CLI). Entry point lives as the **right-most segment of the status footer** (web), the **right-most tab** of the bottom tab bar (mobile), and the **right-most segment of the terminal footer** (TUI). Never decorative; always accent-tinted left-border so it reads as the primary AI affordance.
9. **Multi-CLI agent registry** is global to the workspace, scope-aware in the UI. Every Play / Discuss / Send invocation goes through an agent picker showing the default-routed agent first plus all other configured agents (`claude-code`, `codex`, `gemini-cli`, `opencode`, `pi-cli`, custom). Users can configure unlimited agents. MCP servers and plugins are **per agent** until cross-agent install is supported — the Operate → MCP and Operate → Plugins surfaces show a scope chip per agent, never a global list.
10. **Top-right system icons** in the scope bar have defined behavior: `search` opens ⌘K palette · `bell` opens the Notifications popover (tabbed, with mark-all-read) · `settings` opens the Display popover (theme / density / mode / motion / sidebar) · `?` opens the keyboard cheatsheet overlay · avatar opens the Account popover (workspace switcher, account, API keys, CLI agents, MCP, plugins, sign out). Each icon has a labelled tooltip and `aria-expanded` state. They are never used as decorative chrome.
11. **Viewport ladder.** 320 / 640 / 768 / 1024 / 1280 / 1440 / 1920. Top-level shells wrap in `<main class="shell" style="container-type: inline-size;">`. Tailwind `sm`/`md`/`lg`/`xl` utilities use 640/768/1024/1280 px; `@container (max-width: 1023px)` collapses sidebar + repositions stage-rail to bottom. `@container (max-width: 767px)` shrinks scope-bar + status-footer typography and matches `MOBILE_QUERY`. Mobile-specific surfaces (`mobile-*.html`) skip the container query and use viewport-px directly.
12. **Mobile safe areas.** Web shell uses `viewport-fit=cover` and shared safe-area tokens. Portrait Android reserves at least 24 px above chrome for the status bar and at least 48 px below bottom navigation for the gesture zone. Portrait iOS reserves at least 47 px above chrome for notched devices and at least 34 px below bottom navigation for the home indicator when browser `env(safe-area-inset-*)` values are unavailable. Landscape mobile reserves 48 px Android inline gesture margins and 47 px iOS notch margins on both inline edges, with a 16 px bottom affordance. Design E2E validates this via `/cross-cutting-mobile`; production routes must not lower these reserves to match incomplete mockups.

---

## 14. Sources

### 14.1 Sibling design docs

- [PRODUCT.md](PRODUCT.md) — target-state platform definition.
- [IA-MAP.md](IA-MAP.md) — full route tree, sidebar, keyboard, drawer, palette, status footer, CLI tree, TUI screen list, mobile IA, trace-spine.
- [COPY.md](COPY.md) — voice rules, empty/error/permission templates, status label lock.
- [CLI-TUI-UX.md](CLI-TUI-UX.md) — CLI envelope, flags, completion, TUI keymap, status footer, **TUI-native AI Assist pane** (not a drawer), per-agent MCP/plugin scoping, action-routing CLI, full parity table.
- [OD-PROMPT.md](OD-PROMPT.md) — paste-into-Open-Design block.

### 14.2 Research dossiers + glossary

Each section of this DESIGN.md draws from a local research-dossier set (workflow-nav-IA, agent-supervision, knowledge-docs-memory, observability-trace, cli-tui-design, mobile-a11y-perf-tokens, copy-first-parity). The dossiers live in the project's local working directory and are not tracked. Top critique-focus themes from the PRD glossary drive every component spec: workflow parity, traceability, validation, contract completeness, service boundary, auth, error recovery, accessibility, empty state, mobile, hierarchy, workflow fit.

Product register laws — typography, color, layout, components, motion, bans, permissions — live in the user-global `impeccable` skill (`~/.claude/skills/impeccable/reference/product.md`).

### 14.4 Transformation note

This DESIGN.md is **additive** over the current Fulcrum codebase. Every visual decision here is a transformation of an existing surface (current sidebar nav → workflow stages; current settings tabs → inheritance chips; current trace ID in URL → copyable badge), not a removal. The component vocabulary in §4 is meant to be applied to every existing route in `apps/web/src/routes/**` via the carry-over table in [PRODUCT.md § Transformation Discipline](PRODUCT.md).

> 2026-05-18 OD pass: validated against rendered prototype (38 files → 41 files including ai-assist, desktop-shell, os-widgets, landing). All deltas in this revision are additive.
