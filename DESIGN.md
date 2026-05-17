# DESIGN.md — Fulcrum

> Visual + interaction system grounded in `.scratch/design-research/01..07` and the 1281-entry `.scratch/prd.jsonl` glossary. Drives every web / CLI / TUI / desktop surface. Pairs with [PRODUCT.md](PRODUCT.md).

---

## 0. Posture

- **Register:** product (per [impeccable/reference/product.md](.claude/skills/impeccable/reference/product.md)). Design serves the workbench.
- **Vibe target:** Linear density + k9s status-spine + Plane multi-layout view ergonomics + Plannotator review surface + ACP-UI protocol clarity. Not Notion cream, not Jira ribbons, not crypto neon.
- **Scene sentence (drives theme + density):** *Operator at a 27-inch monitor at 1am, switching between web shell + terminal, supervising five agents in parallel runs, glancing at trace IDs to cross-reference audit. Room is dim. Brightness is low. Eye fatigue is real. Density must not shout.*
- That sentence forces a **dark-leaning theme with explicit light theme parity** (system colors flip; no theme baked into chrome), a calm one-accent palette, and a status-rich semantic vocabulary.

---

## 1. Foundation — design tokens

Source: research-06 §5 ([06-mobile-a11y-perf-tokens.md §5](.scratch/design-research/06-mobile-a11y-perf-tokens.md)).

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
| `fg-muted` | `oklch(0.58 0.01 270)` | `oklch(0.55 0.005 270)` | Tertiary, captions, hints |
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

Row height baseline = 24 px (research-01 §13). Tables 28 px comfortable / 24 px cozy / 20 px compact via density toggle.

### 1.5 Breakpoints

From research-06 §6 plus Fulcrum-specific `xs`:

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

System font stack ([impeccable/reference/product.md](.claude/skills/impeccable/reference/product.md)):

```css
font-sans:  Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
font-mono:  "Geist Mono", "JetBrains Mono", "Berkeley Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

**One family carries everything** — Inter for UI; Geist Mono for trace IDs, code blocks, status footer, JSON output.

### 2.1 Scale (fixed rem, ratio 1.125, density bias)

| Token | Size | Line | Weight | Use |
|---|---|---|---|---|
| `text-xs` | 11px (0.6875rem) | 16 | 500 | Captions, badge text, status footer |
| `text-sm` | 12px (0.75rem) | 18 | 500 | Inputs labels, table headers, tabs |
| `text-base` | 13px (0.8125rem) | 20 | 400 | **Default body** (Linear-grade density) |
| `text-md` | 14px (0.875rem) | 22 | 500 | Section labels, button labels |
| `text-lg` | 16px (1rem) | 24 | 500 | Card titles |
| `text-xl` | 18px (1.125rem) | 26 | 600 | Modal titles, page headings |
| `text-2xl` | 22px (1.375rem) | 32 | 600 | Stage titles |

Body line length 65–75ch in prose surfaces (doc editor). Tables, run feed, audit log: dense (120ch+ ok).

### 2.2 Weights

400 / 500 / 600 only. No 700 in UI (reserve for in-doc prose emphasis).

---

## 3. Layout

### 3.1 Chrome layout (web, desktop ≥ lg)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  SCOPE BAR  ws · project / subpath  ·  stage tabs  ·  trace-id  ·  ⊞  ⌘K  bell │  32px
├──────────────┬──────────────────────────────────────────────┬─────────────────┤
│              │                                              │                 │
│  STAGE NAV   │            STAGE CONTENT                     │   ACP DRAWER    │
│  (Capture)   │   (board / doc / runs / review / artifacts)  │   (pullable)    │
│   Plan       │                                              │   step context  │
│   Build      │                                              │   live thread   │
│   Review     │                                              │   trace badge   │
│   Ship       │                                              │   ▶ Run         │
│   Operate    │                                              │   💾 Save       │
│  ─────       │                                              │                 │
│   Dashboard  │                                              │                 │
│   Projects   │                                              │                 │
│   Search     │                                              │                 │
│   Memory     │                                              │                 │
│   Inbox      │                                              │                 │
│  ─────       │                                              │                 │
│   Doctor     │                                              │                 │
│   Settings   │                                              │                 │
│              │                                              │                 │
├──────────────┴──────────────────────────────────────────────┴─────────────────┤
│  STATUS FOOTER   profile · scope · run x/y · agent · mcp · trace · time · ? · :│  28px
└───────────────────────────────────────────────────────────────────────────────┘
```

- Scope bar 32 px desktop / 40 px mobile.
- Stage nav rail collapsed = 56 px (icons only) / expanded = 220 px (label).
- Status footer 28 px desktop, fixed bottom. **TUI status footer mirrors this exactly** (research-05 §3.6).
- Drawer 360–560 px user-adjustable, sticky across nav, hidden on `<lg`.

### 3.2 Mobile chrome (`<md`)

- Scope bar collapses to workspace+project chip on left, drawer pull-handle on right.
- Stage nav becomes a **bottom tab bar**: 6 stage icons + 5-item more menu.
- Drawer → bottom sheet 60vh default, draggable.
- Status footer hidden; trace ID accessible via swipe-down quick panel.

### 3.3 Stage content layouts

Five canonical content shapes used across stages:

1. **List + Detail (peek-overview).** Left list (320 px) + right detail (flex). Click row = peek modal slides over without changing route (research-07 §1.3). Used: tasks, runs, artifacts, audit.
2. **Multi-layout grid.** View switcher (board / list / table / calendar / gantt) over same data set. Used: tasks (Build), reviews (Review). Verbatim Plane shape.
3. **Editor surface.** Tree (240 px) + editor (flex) + backlinks rail (collapsible 280 px). Used: docs (Capture), plans (Plan).
4. **Live session pane.** Sessions list (220 px) + transcript (flex) + workspace dock (320 px, tabs: Shell · Files · Browser · Plan · Cost). Sticky plan strip at top of transcript (research-02 § Web Live Session Pane). Used: ACP planning (Plan), agent runs (Build).
5. **Subsystem table.** Full-width table with inline expand. Used: doctor (Operate), audit (Ship), error logs (Operate).

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

### 4.3 Tables

Verbatim Plane spreadsheet shape (research-07 §1.3) + Linear density.

- 24 px row height (cozy default), 20 px compact, 28 px comfortable.
- Sticky header. Resizable + reorderable columns. Sort indicator on hover, persistent when active.
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
| **Side drawer (right)** | Persistent context (ACP chat), survives nav | 360–560 px user-resizable |
| **Peek modal** (Plane peek-overview) | Quick read of one entity, single click to dismiss | 720 px centered |
| **Sheet (mobile)** | Mobile equivalent of drawer / peek modal | full width × 60vh draggable |
| **Confirm modal** | Irreversible action only | 400 px centered |
| **Full modal** | Multi-step workflow that needs focus (rare) | 800 px centered |

Hard ban: two modals open at once. Sheets stack into drawer.

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

- ▶ Play 24px primary action button. Click → mode picker popover (agent + model + policy + optional prompt). Run streams inline below the step.
- 💬 Discuss 24px secondary. Opens inline thread anchored to the step.
- ⊞ Drawer pulls right-side ACP chat scoped to this step.
- ⋮ More: clone / archive / change owner / lock for review.

Keyboard: `p` Play / `d` Discuss / `⌘/` drawer / `c` clone (on focused row).

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
- **`prefers-reduced-motion: reduce`** collapses every motion to opacity-only 80 ms (research-06 §2).

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

---

## 9. Run feed + multi-agent orchestrator

Per research-02 § Web Run Feed + § Web Multi-Agent Orchestrator.

- Per-task vertical event timeline: columns time / kind / session / agent / summary / cost-delta.
- Filters: kind / session / agent / status. Saved views (Temporal pattern).
- Group-by `parent_tool_use_id` collapses subagent fan-outs.
- Inline "mark success / retry / terminate" verbs per row.

Orchestrator: left rail DAG (Sugiyama via research-07 §3.2), node colour = ACP status. Click node → swap centre pane to that run's Live Session Pane. Right rail = sticky cost + SLO panel.

---

## 10. Doctor / audit / error logs

Per research-04 § Doctor / Audit / Error logs.

- **Doctor:** subsystem table, 5-state vocabulary, per-row Probe button, recovery copy-button, telemetry row mandatory.
- **Audit:** row `(timestamp, actor, action, target, outcome, source_event_id, trace_id, details)`, filter row above table, JSONL/NDJSON export.
- **Error logs:** Sentry fingerprint grouping `(error_type, top_user_frame, tool_name)`, drill-down with timeline + facet map + linked runs.

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
- No hero illustrations.
- No persistent welcome banners after first session.
- No telemetry without opt-in (research-04 §14).
- No "you have unread items" guilt UI.

---

## 13. Cross-surface invariants

For every Fulcrum surface (web / CLI / TUI), the following must hold:

1. **Trace ID** visible + copyable (web badge / CLI envelope key / TUI footer segment).
2. **Project + stage** visible at chrome level (research-01 §5).
3. **Four-mode affordance** per step (manual / Play / Discuss / ACP drawer).
4. **Command palette** parity: `⌘K` web, `:` TUI, `fulcrum <verb>` CLI (research-05 §3.5).
5. **Status vocabulary** identical (eight states, same colour, same icon).
6. **Empty states** identical structure (one sentence + one action).
7. **Error copy** template: `[what failed]. [why, if non-obvious]. [exact next step]. trace=<id>`.
8. **ACP chat** reachable in one keystroke from anywhere (`⌘/` web, `c` TUI, `fulcrum chat` CLI).

---

## 14. Sources

### 14.1 Sibling design docs

- [PRODUCT.md](PRODUCT.md) — target-state platform definition.
- [IA-MAP.md](IA-MAP.md) — full route tree, sidebar, keyboard, drawer, palette, status footer, CLI tree, TUI screen list, mobile IA, trace-spine.
- [COPY.md](COPY.md) — voice rules, empty/error/permission templates, status label lock.
- [CLI-TUI-UX.md](CLI-TUI-UX.md) — CLI envelope, flags, completion, TUI keymap, status footer, ACP chat pane, parity table.
- [OD-PROMPT.md](OD-PROMPT.md) — paste-into-Open-Design block.

### 14.2 Research dossiers (`.scratch/design-research/`)

Each section of this DESIGN.md cites the dossier it draws from.

- [01-workflow-nav-ia.md](.scratch/design-research/01-workflow-nav-ia.md) — drives §3 (chrome layout), §4.12 (palette), §4.10 (trace badge), §7 (density), §13 (invariants). Linear / Plane / Devin / Cursor / GitHub Projects / Notion / k9s.
- [02-agent-supervision.md](.scratch/design-research/02-agent-supervision.md) — drives §4.5 (tool-call card), §8 (live session pane), §9 (run feed + orchestrator). Devin / Cursor / Claude Code / Codex / Aider / Replit / Linear Agents / LangSmith / Temporal / Argo / Dagster / Airflow / ACP.
- [03-knowledge-docs-memory.md](.scratch/design-research/03-knowledge-docs-memory.md) — drives editor block set, slash menu, mentions, attachments, version history, comments, backlinks, memory tier model. Notion / Docmost / Outline / Coda / Anytype / Logseq / Obsidian / HedgeDoc / Tana / Linear docs / Slack Canvas.
- [04-observability-trace.md](.scratch/design-research/04-observability-trace.md) — drives §4.9 (status vocabulary), §4.10 (trace-ID badge), §10 (doctor/audit/error logs). Datadog / Honeycomb / Sentry / LangSmith / Grafana / OpenTelemetry / GitHub Actions / Vercel / Healthchecks / k9s / CloudTrail / Stripe / Okta / Auth0 / npm doctor.
- [05-cli-tui-design.md](.scratch/design-research/05-cli-tui-design.md) — drives §3 (status footer), pairs with CLI-TUI-UX.md. gh / stripe / vercel / wrangler / flyctl / cargo / bun / kubectl / doctl / heroku / clig.dev / 12-factor / k9s / lazygit / tig / htop/btop / fzf / Helix / Charm / OpenTUI / gh-dash.
- [06-mobile-a11y-perf-tokens.md](.scratch/design-research/06-mobile-a11y-perf-tokens.md) — drives §1 (tokens), §1.5 (breakpoints), §1.6 (reduced motion / forced colors), §2 (typography), §13 (cross-surface). Tailwind v4 / Apple HIG / Material 3 / shadcn-svelte / GitHub Mobile / GOV.UK / Atlassian / IBM Carbon / Radix / Bits UI / Melt UI / Core Web Vitals / Workbox / Vercel Speed Insights / TanStack Virtual / OKLCH.
- [07-copy-first-parity.md](.scratch/design-research/07-copy-first-parity.md) — drives §3.3 (multi-layout grid), §4.4 (board cards), §4.6 (inline diff), §8 (live session pane), §10 (doctor/audit). Plane / Docmost / Fusion / Plannotator / ACP-UI master adoption table + Top-30 must-copy.

### 14.3 PRD glossary + impeccable + goal

- [.scratch/prd.jsonl](.scratch/prd.jsonl) — 1281 entries, top critique_focus themes drive every component spec (`workflow parity` 178, `traceability` 148, `validation` 146, `contract completeness` 142, `service boundary` 141, `auth` 140, `error recovery` 119, `accessibility` 114, `empty state` 113, `mobile` 109, `hierarchy` 108, `workflow fit` 107).
- [.claude/skills/impeccable/reference/product.md](.claude/skills/impeccable/reference/product.md) — product register laws (typography, color, layout, components, motion, bans, permissions).
- [.scratch/manual-smoke-2026-05-17/manual-smoke-ux-remediation-loop-goal.md](.scratch/manual-smoke-2026-05-17/manual-smoke-ux-remediation-loop-goal.md) — Ralph-Wiggum-style /goal loop with append-only PRD discipline.

### 14.4 Transformation note

This DESIGN.md is **additive** over the current Fulcrum codebase. Every visual decision here is a transformation of an existing surface (current sidebar nav → workflow stages; current settings tabs → inheritance chips; current trace ID in URL → copyable badge), not a removal. The component vocabulary in §4 is meant to be applied to every existing route in `apps/web/src/routes/**` via the carry-over table in [PRODUCT.md § Transformation Discipline](PRODUCT.md).
