# Phase 5: Dependency & Library Research

**Date:** 2026-05-05
**Scope:** Best Svelte-compatible packages per feature area
**Purpose:** Minimize custom code, maximize reusability

---

## Recommended Dependencies

| Feature | Package | npm | Stars | Svelte 5 | Bundle | Rationale |
|---|---|---|---|---|---|---|
| **Kanban DnD** | svelte-dnd-action | `svelte-dnd-action` | 2.1k | ✓ (onconsider/onfinalize) | ~15kb | Best Svelte DnD: cross-container, touch, a11y |
| **Kanban DnD alt** | dnd-kit-svelte | `dnd-kit-svelte` | newer | ✓ | smaller | Port of dnd-kit; smaller API |
| **Gantt** | SVAR Gantt v2 | `@svar/gantt-svelte` | MIT | ✓ native | ~40kb | Dep arrows, drag, 10k tested. Pro adds baselines |
| **Gantt alt** | svelte-gantt | `svelte-gantt` | — | partial | lighter | Zero deps, less features than SVAR |
| **Calendar** | Event Calendar | `@event-calendar/core` | — | ✓ | zero-dep | Month/week/day, drag, multi-day, render slots |
| **Calendar alt** | svelte-fullcalendar | `svelte-fullcalendar` | — | partial | ~100kb+ | FullCalendar v6 wrapper; heavier |
| **Charts** | LayerChart | `layerchart` | — | ✓ | D3-based | Line, area, stacked area (CFD), bar, scatter, histogram |
| **Rich Text** | TipTap + extensions | `@tiptap/extension-mention` | — | ✓ | modular | Mention popup, task-list, collaboration, placeholder |
| **Collab** | Yjs + y-websocket | `yjs` `y-websocket` | 16k | agnostic | ~20kb | CRDT for real-time cursors via TipTap collaboration ext |
| **Cmd+K** | shadcn-svelte Command | via `bits-ui` | — | ✓ | included | cmdk-sv deprecated; Bits UI Command is successor |
| **Kbd shortcuts** | tinykeys | `tinykeys` | — | agnostic | 650B | `$mod` cross-platform, clean API. Wrap in onMount |
| **Kbd alt** | @svelte-put/shortcut | `@svelte-put/shortcut` | — | ✓ | action-based | Svelte action; smaller ecosystem |
| **Table** | TanStack Table | `@tanstack/svelte-table` | — | ✓ (alpha) | headless | Column resize, sorting, filtering, virtual scroll combo |
| **Virtual scroll** | TanStack Virtual | `@tanstack/svelte-virtual` | — | ✓ | headless | 60fps, pairs with TanStack Table |
| **Table alt** | AG Grid Community | `ag-grid-community` | — | community wrapper | heavy | No official Svelte; maintenance risk |
| **Filter builder** | Custom (shadcn primitives) | — | — | — | — | No Svelte filter lib exists; Select+Popover+Badge |
| **Activity feed** | Custom | — | — | — | — | Timeline CSS + Svelte #each; trivial markup |
| **ASCII charts** | asciichart | `asciichart` | — | Node/Bun | pure JS | Sparklines + line charts for TUI |
| **Dates** | date-fns | `date-fns` | — | agnostic | tree-shake | ~18kb gzip used; cycle time math, sprint dates |
| **Dates alt** | dayjs | `dayjs` | — | agnostic | 6kb base | Use if bundle size critical |

---

## Detailed Notes

### LayerChart for CFD/Burndown
No pre-built burndown component. But:
- **CFD** = `AreaChart` with `series` layout `stack` → stacked area, one series per status
- **Burndown** = `LineChart` with two series (actual remaining + ideal line)
- **Velocity** = `BarChart` with bar per sprint + `LineChart` overlay for rolling avg
- **Cycle time scatter** = `ScatterChart` with percentile reference lines
- **Histogram** = binning logic → `BarChart`

Expect 30-50 lines custom code per chart type. All via composable primitives.

### TipTap Extensions Needed
Already using TipTap for task descriptions. Add:
- `@tiptap/extension-mention` — suggestion popup, full render control
- `@tiptap/extension-task-list` — `[ ]` / `[x]` checklist syntax
- `@tiptap/extension-collaboration` — Yjs CRDT real-time
- `@tiptap/extension-collaboration-cursor` — cursor positions + name labels
- `@tiptap/extension-placeholder` — placeholder text

All first-party TipTap extensions.

### Yjs / y-websocket for Real-Time Collaboration
- `y-websocket` runs as standalone WebSocket server or alongside existing HTTP server
- Persistence: `y-websocket` supports LevelDB out of box; for PostgreSQL, use `y-postgresql` or manual Yjs doc serialization (`Y.encodeStateAsUpdate`)
- Can run alongside Hono — separate WebSocket endpoint on different port or path
- TipTap collaboration extension wraps Yjs automatically

### svelte-dnd-action in Svelte 5
- Must use `onconsider`/`onfinalize` (not `on:consider`) in Svelte 5 runes files
- Supports: sortable lists, cross-container drag, board columns, backlog→sprint

### TanStack Table + Virtual
- `@tanstack/svelte-table` Svelte 5 support on latest alpha — pin version
- Combine with `@tanstack/svelte-virtual` for virtualized rows (1000+ tasks)
- Headless = full shadcn-svelte style control
- AG Grid community wrapper is unofficial — avoid for production

### Filter Builder
No Svelte-native filter builder library exists. Every platform (Linear, Notion, Height) built custom. Use shadcn-svelte:
- `Popover` for condition builder
- `Select` for field/operator pickers
- `Badge` for filter chips
- `Button` for add/remove
- `Command` for field search within popover

Expect 200-400 lines for a multi-condition filter builder.

### SVAR Gantt vs Custom SVG
SVAR Gantt provides out of box:
- Task bars with drag-to-reschedule and drag-to-resize
- Dependency arrows (automatic from data)
- Zoom levels: day/week/month
- 10,000 task rendering tested
- Svelte 5 native component

Custom SVG with LayerChart scales would require:
- Manual bar rendering
- Manual arrow drawing with path calculation
- Manual zoom/pan interaction
- Manual virtual scrolling for large datasets
- Estimated 1000+ lines custom code

**Decision: SVAR Gantt eliminates ~1000 lines of custom code.**

### @event-calendar/core vs Custom Calendar
Event Calendar provides:
- Month, week, day, list views
- Drag-to-reschedule
- Multi-day event spans
- Event rendering slots (customize card content)
- Zero dependencies

Custom CSS Grid calendar would require:
- Manual month/week/day view switching
- Manual drag interaction
- Manual multi-day span calculation
- Estimated 500+ lines custom code

**Decision: @event-calendar/core eliminates ~500 lines of custom code.**
