# Phase 5: Task Management + Metrics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 05-task-management-metrics
**Areas discussed:** Comments entity design, Watchers entity design, Metrics computation strategy, Chart library + visualization, Gantt/Calendar view architecture, Bulk operations design, Custom fields verification, Saved view filters, Sprint enhancements, Three-surface parity
**Mode:** `--all --auto` (fully autonomous)

---

## Comments Entity Design

| Option | Description | Selected |
|--------|-------------|----------|
| Flat comments | Chronological, no nesting, resolve/unresolve | ✓ |
| Threaded comments | Nested replies with parent_id | |
| Hybrid (flat + quote-reply) | Flat list with quote-reply references | |

**Auto-selected:** Flat comments with resolve/unresolve (recommended default)
**Rationale:** Flat threading simpler to implement, matches most project management tools. Nesting deferred.

| Option | Description | Selected |
|--------|-------------|----------|
| TipTap JSON (match Task pattern) | Rich text matching existing Task.tiptapContent | ✓ |
| Plain text only | Simple string body | |
| Markdown string | Markdown parsed client-side | |

**Auto-selected:** TipTap JSON (recommended default)
**Rationale:** Reuses existing `tasks-rich-text.ts` infrastructure. Consistent UX across task descriptions and comments.

---

## Metrics Computation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| graphile-worker rollup + MetricsCache | Background job writes to cache entity | ✓ |
| Real-time SQL aggregation | Compute on every request | |
| Hybrid (real-time + periodic cache) | Real-time for small datasets, cache for large | |

**Auto-selected:** graphile-worker rollup + MetricsCache (recommended default)
**Rationale:** MetricsCache entity already exists. graphile-worker established in Phase 2. Event-driven invalidation via EventBus.

| Option | Description | Selected |
|--------|-------------|----------|
| Event-driven invalidation | EventBus triggers job on task state change | ✓ |
| Periodic polling (every N minutes) | Cron-style recalculation | |
| On-demand (compute when viewed) | Lazy computation on dashboard load | |

**Auto-selected:** Event-driven invalidation (recommended default)
**Rationale:** EventBus pattern established. Minimizes stale data window while avoiding unnecessary recomputation.

---

## Chart Library + Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| LayerChart | Svelte-native, D3-based, per roadmap spec | ✓ |
| Chart.js with svelte wrapper | Canvas-based, widely used | |
| Custom D3 directly | Maximum flexibility, more code | |

**Auto-selected:** LayerChart (recommended default — per roadmap specification)

| Option | Description | Selected |
|--------|-------------|----------|
| Client-only dynamic import | No SSR, browser DOM required | ✓ |
| SSR with hydration | Server-render SVG | |

**Auto-selected:** Client-only rendering (recommended default)
**Rationale:** D3/SVG chart libraries require browser DOM. Dynamic import avoids SSR hydration issues.

---

## Gantt + Calendar View Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Custom SVG with LayerChart scales | Lightweight, consistent with other charts | ✓ |
| dhtmlx-gantt or similar library | Full-featured but heavy | |
| HTML table-based timeline | Simple but limited | |

**Auto-selected:** Custom SVG with LayerChart scales (recommended default)
**Rationale:** Avoids heavy library dependency. LayerChart's D3 scales provide time axis; bars and arrows are straightforward SVG.

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only v1 | View only, no drag interaction | ✓ |
| Drag-to-reschedule | Interactive timeline editing | |

**Auto-selected:** Read-only v1 (recommended default)
**Rationale:** Drag interaction is complex. Ship read-only first, iterate.

---

## Bulk Operations Design

| Option | Description | Selected |
|--------|-------------|----------|
| Single transaction, all-or-nothing | Entire batch succeeds or rolls back | ✓ |
| Per-task transactions, partial success | Each task independent, report failures | |
| Chunked transactions (batches of 10) | Compromise between atomicity and resilience | |

**Auto-selected:** Single transaction, all-or-nothing (recommended default)
**Rationale:** Simpler mental model. 200-task cap keeps transaction size reasonable.

| Option | Description | Selected |
|--------|-------------|----------|
| Single bulk Event record | One event for entire batch | ✓ |
| Per-task Event records | Individual audit entries | |

**Auto-selected:** Single bulk Event record (recommended default)
**Rationale:** Avoids event flood on large batches. Bulk event references task IDs array.

---

## Three-Surface Parity

| Option | Description | Selected |
|--------|-------------|----------|
| CLI: JSON data only | `--json` flag, no visual charts | ✓ |
| CLI: ASCII charts | Terminal chart rendering | |

**Auto-selected:** CLI JSON data only (recommended default)
**Rationale:** CLI users pipe to `jq`/external tools. ASCII charts are novelty, not utility.

| Option | Description | Selected |
|--------|-------------|----------|
| TUI: ASCII bar/sparkline charts | Terminal box-drawing character charts | ✓ |
| TUI: No charts, tables only | Numeric tables for metrics | |

**Auto-selected:** ASCII bar/sparkline charts (recommended default)
**Rationale:** TUI is interactive — visual representation adds value. Terminal rendering is lightweight.

---

## Claude's Discretion

- Chart color palette and visual styling within shadcn-svelte design system
- ASCII chart rendering approach for TUI (library or hand-rolled)
- Exact tRPC query shape for metrics endpoints
- Test fixture data generation for bulk operation tests

## Deferred Ideas

- Drag-to-reschedule in Gantt view
- Drag-to-reassign in calendar view
- Notification delivery from watchers (Phase 7)
- Real-time chart updates via WebSocket/SSE
- Chart export to PNG/PDF
- Comment threading/nesting (v2)
- Comment reactions/emoji (v2)
