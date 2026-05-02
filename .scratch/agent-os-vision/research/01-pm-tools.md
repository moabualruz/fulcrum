# PM Tools Fit Report — Project Management Building Blocks

**Stack:** Bun + SvelteKit 2 + shadcn-svelte + PGlite + Tailwind v4  
**Date:** 2026-05-01  
**Constraint:** License must be MIT / Apache / BSD (AGPL/SSPL/BSL disqualify unless re-licensable)

---

## 1. Self-Hostable PM Platforms

These are evaluated for **schema/domain model inspiration and selective component extraction**, not wholesale adoption. Embedding a full Rails or Django stack is a non-starter for the Bun/SvelteKit target.

| Name | License | Stack | Last Release | Stars | PM Domain Coverage | Fit % | Notes |
|------|---------|-------|-------------|-------|-------------------|-------|-------|
| **Plane** | AGPL-3.0 | React + Django + Postgres | v1.3.0 — Apr 2026 | 48.6k | Issues, epics, cycles/sprints, roadmaps, custom fields, views, backlog | 85% domain match | AGPL blocks commercial embedding. Best REST API + data model to copy. 48k stars = proven schema. |
| **Focalboard** | Apache-2.0 | Go + TypeScript | v8.0.0 — Jun 2024 | 26.1k | Kanban boards, board views, custom fields | 40% | **Archived / unmaintained** — Mattermost folded it into plugin. Do not depend on. |
| **OpenProject** | GPL-3.0 | Ruby on Rails + Angular | 17.3.1 — Apr 2026 | 15k | Full PM: Gantt, sprints, roadmaps, time tracking, docs | 75% domain | GPL-3 = cannot embed commercially. Heavy Ruby stack. Schema is enterprise-grade; good reference. |
| **WeKan** | MIT | Node.js + Meteor | v9.03 — Apr 2026 | 20.9k | Kanban, lists, swimlanes, basic labels | 35% | MIT. Meteor is legacy/niche. No sprints, no epics, no burndown. Kanban-only. |
| **Vikunja** | AGPL-3.0 | Go + Vue | v2.3.0 — Apr 2026 | 4.1k | Tasks, lists, gantt, kanban, teams | 55% | AGPL. Good API; task hierarchy is flat (no true epics). Limited for full PM scope. |
| **Kanboard** | MIT | PHP | 1.2.52 — Apr 2026 | 9.6k | Kanban, swimlanes, subtasks, time tracking | 45% | MIT. Maintenance mode (author says no new features). PHP. Minimal roadmap/sprint support. |
| **Leantime** | AGPL-3.0 | PHP + Blade | v3.7.3 — Mar 2026 | 9.7k | Sprints, tasks, roadmaps, retrospectives, goals | 65% | AGPL. Accessibility-first design philosophy. No custom fields. PHP stack incompatible. |
| **Taiga** | AGPL-3.0 | Python + Angular/CoffeeScript | Inactive front-end | 370 (front) | Kanban, sprints, epics, backlog, wiki | 70% | AGPL. Frontend appears stale (CoffeeScript). Backend still maintained separately. |
| **Tegon** | AGPL-3.0 | TypeScript | 0.3.11-alpha — Mar 2025 | 1.9k | Issues, cycles, triage, AI labels | 50% | **Archived Jun 2025** — dead project. Do not use. |
| **Wekan** | MIT | Node.js + Meteor | v9.03 — Apr 2026 | 20.9k | (Same as WeKan above — same project) | — | — |

**Key finding:** No permissively-licensed (MIT/Apache) PM platform covers the full domain (epics + sprints + roadmap + burndown + custom fields). Plane is the closest domain match but is AGPL. **Use Plane's open REST API schema as the domain model template** without embedding the server.

---

## 2. Drag-and-Drop / Kanban Libraries

| Name | License | Lang/Runtime | Last Release | Stars | Coverage | Fit % | Notes |
|------|---------|-------------|-------------|-------|----------|-------|-------|
| **svelte-dnd-action** | MIT | JS (Svelte action) | No versioned releases; npm latest 2024 | 2.1k | Kanban columns, reorder, cross-list, touch, keyboard, a11y | 90% | Current choice. Svelte-native action model. Full a11y + touch. Svelte 5 compatible (event name change only). No built-in animations beyond CSS. |
| **pragmatic-drag-and-drop** | Apache-2.0 | TS, framework-agnostic | Continuous npm publish | 12.6k | Low-level primitives; powers Jira/Trello | 75% | Powers production Atlassian apps. 4.7kB core. Framework-agnostic → needs Svelte wrappers. More plumbing required vs. svelte-dnd-action. |
| **formkit/drag-and-drop** | MIT | TS (data-first) | v0.5.3 — Apr 2025 | 1.9k | List reorder, cross-list transfer | 55% | 4kB. No keyboard nav — a11y gap for PM. Works in Svelte but no dedicated adapter. |
| **SortableJS** | MIT | Vanilla JS | v1.15.7 — Feb 2026 | 31.1k | Reorder, nested, multi-drag, touch | 70% | Most stars, most battle-tested. No Svelte bindings built-in (community wrappers exist). Requires DOM imperative style in Svelte. |
| **SVAR Svelte Kanban** | MIT | Svelte | ~2025 | ~100 | Kanban board with DnD | 65% | MIT, Svelte-native. Low stars / young community. Open edition is free; PRO adds more. Worth watching but not mature. |

---

## 3. Gantt / Timeline / Roadmap Libraries

| Name | License | Lang/Runtime | Last Release | Stars | Coverage | Fit % | Notes |
|------|---------|-------------|-------------|-------|----------|-------|-------|
| **frappe-gantt** | MIT | Vanilla JS (SVG) | v1.0.3 — Feb 2025 | 6k | Gantt bars, dependencies, date ranges | 55% | Simple and clean. No resource view, no critical path. Good for basic roadmap view. SVG-based. |
| **vis-timeline** | Apache-2.0 / MIT | Vanilla JS | v8.5.0 — Dec 2025 | 2.3k | Timeline, items, groups, ranges, zoom | 65% | Dual license (Apache/MIT). Rich timeline interactions. Not Svelte-native; imperative API. Suitable for roadmap + sprint timeline. |
| **svelte-gantt** | MIT | Svelte | No versioned releases; npm 2024 | 618 | Gantt, drag-drop, dependencies, tree view | 70% | Svelte-native, TypeScript. Best Svelte-first option. Low stars but actively contributed. |
| **SVAR Svelte Gantt** | MIT (open) / Commercial (PRO) | Svelte | ~2025 (18 tags) | 225 | Full Gantt with dependencies, zoom, filters (free); auto-scheduling, critical path, export (PRO) | 60% | MIT for core. PRO license needed for enterprise features. Very low community; commercial dependency risk. |
| **bryntum Gantt** | Commercial | JS | Current | — | Enterprise Gantt, full PM | 30% | Not evaluated — commercial license incompatible with open build. |
| **syncfusion** | Community (revenue-gated) | JS/Svelte | Current | — | Gantt, scheduler | 25% | Community license free under $1M revenue. Too complex for targeted use. |

---

## 4. Charts — Burndown / Velocity

| Name | License | Lang/Runtime | Last Release | Stars | Coverage | Fit % | Notes |
|------|---------|-------------|-------------|-------|----------|-------|-------|
| **LayerChart** | MIT | Svelte (d3-based) | v1.0.13 — Jan 2026 | 1.2k | Composable: line, area, bar, radial, geo, hierarchy | 90% | Best fit. Svelte-native, composable primitives, built on d3. Burndown + velocity are straightforward line/area charts. Tailwind-friendly. shadcn-svelte ecosystem adjacent. |
| **Chart.js** | MIT | Vanilla JS | v4.5.1 — Oct 2025 | 67.4k | Line, bar, pie, radar, doughnut | 75% | Gold standard for simple charts. Works in Svelte via `<canvas>`. Less composable than LayerChart but zero Svelte-specific issues. |
| **Apache ECharts** | Apache-2.0 | TS/JS | v6.0.0 — Jul 2025 | 66.2k | Full suite: line, bar, heatmap, scatter, tree, geographic | 70% | Permissive Apache-2.0. Heavyweight (400kB+). Best for complex custom dashboards. Svelte wrapper exists. |
| **ApexCharts** | Dual: MIT (community) / Commercial ($2M+ revenue) | JS | v5.10.6 — Apr 2026 | 15.1k | Interactive SVG charts, 12+ types | 65% | Revenue gate: commercial license if >$2M ARR. Community MIT otherwise. Official Vue/React wrappers; Svelte community wrapper. |
| **recharts** | MIT | React | — | — | Line, bar, area — React only | 0% | React-only — skip. |

---

## 5. Command Palette / Keyboard-First UX

| Name | License | Lang/Runtime | Last Release | Stars | Coverage | Fit % | Notes |
|------|---------|-------------|-------------|-------|----------|-------|-------|
| **shadcn-svelte Command (Bits UI)** | MIT | Svelte 5 (Bits UI primitive) | Active — 2025/2026 | N/A (part of shadcn-svelte) | Command palette, combobox, keyboard nav, fuzzy search | 95% | **cmdk-sv was deprecated in favor of this.** Already in the stack via shadcn-svelte. Svelte 5 runes-native. Ownership model means full customization. No extra dep. |
| **ninja-keys** | MIT | Web Component (framework-agnostic) | No versioned releases | 1.7k | Hotkey palette, nested menus, light/dark, Svelte example | 75% | Web Component → works with Svelte. Simpler API than Bits UI Command. Good for global hotkey registration outside of search. |
| **kbar** | MIT | React | v0.1.0-beta.48 — Jul 2025 | 5.2k | Full command bar, nested actions, history, a11y | 10% | React-only. Svelte port does not exist at production quality. Skip. |

---

## 6. Tables / Virtual Lists

| Name | License | Lang/Runtime | Last Release | Stars | Coverage | Fit % | Notes |
|------|---------|-------------|-------------|-------|----------|-------|-------|
| **TanStack Table (Svelte adapter)** | MIT | TS (headless) | Apr 2026 (v8 latest) | 27.9k | Sorting, filtering, grouping, pagination, column pinning | 80% | v8 Svelte adapter works with Svelte 5 via workarounds; v9 (with native Svelte 5 support) is in alpha. Headless → full style control. Community workarounds are stable as of Apr 2025. |
| **TanStack Virtual (Svelte adapter)** | MIT | TS (headless) | Active | 5k+ (virtual repo) | Virtualized lists and tables | 80% | Pairs with TanStack Table. Svelte 5 adapter has some known issues (issue #866 open); workarounds exist. |
| **AG Grid Community** | MIT | TS | v35.2.1 — Apr 2026 | 15.3k | Full datagrid: sort, filter, pagination, DnD rows, CSV export | 70% | MIT community edition is feature-rich. No official Svelte 5 adapter — community wrappers (`ag-grid-svelte5-extended`) fill gap. Overkill for most PM list views. |
| **@humanspeak/svelte-virtual-list** | MIT | Svelte 5 | Active 2025 | ~200 | Virtual scroll, variable heights, TypeScript | 65% | Lightweight Svelte 5-native virtualizer. Good for task list views without full table features. |

---

## 7. Domain Schema Reference

No OSS library ships a standalone "PM domain model" package. The following projects serve as schema blueprints:

| Source | Key Entities | Notes |
|--------|-------------|-------|
| **Plane REST API** | Workspace → Project → Issue → Sub-issue; Cycle (sprint); Module (epic); Label; State; Priority; Estimate; Member | Most complete open REST schema for Linear-class PM. Apache-2.0 SDK (Node.js + Python). |
| **OpenProject API** | Project → Work Package → Relations; Versions (sprints); Roadmap; Time Entry | Deep Jira-class schema. GPL-3 but schema is reference-only. |
| **Linear GraphQL schema** | Team → Issue → Sub-issue; Cycle; Project (epic-class); Milestone; Label; Workflow State | Closed SaaS but schema is well-documented. Closest to the target UX model. |
| **GitHub Projects v2** | Organization → Project → Item (Issue/PR/DraftIssue); Field (custom); View; Workflow | Good precedent for custom fields + saved views. Open GraphQL schema. |

---

## 8. Recommended Layered Architecture

### Layer 1 — Kanban Board / Drag-and-Drop
**Pick:** `svelte-dnd-action` (MIT, current dep)

Rationale: Already in stack. Svelte-native action model, full a11y + touch support, no framework impedance mismatch. Works cleanly in Svelte 5 with minor event naming adjustment.

**Failure gates:** (1) Svelte 5 runes-based reactivity causes persistent bugs with `onconsider`/`onfinalize` event model. (2) Performance degrades with >500 cards in a single container. (3) Complex multi-board drag (cross-epic) breaks.

**2nd choice:** `pragmatic-drag-and-drop` (Apache-2.0) — requires writing Svelte wrappers but is battle-tested at Atlassian scale.

**3rd choice:** `SortableJS` (MIT) — imperative API, most battle-tested across environments, but DOM manipulation style fights Svelte's reactive model.

---

### Layer 2 — Roadmap / Gantt / Timeline
**Pick:** `svelte-gantt` (MIT) for sprint timeline + dependency view; `frappe-gantt` (MIT) for simple roadmap bars.

Rationale: `svelte-gantt` is the only production-quality Svelte-native Gantt. `frappe-gantt` fills the roadmap use case with minimal complexity. Both MIT.

**Failure gates for svelte-gantt:** (1) Low community (618 stars) means abandonment risk if maintainer steps away. (2) No accessible keyboard interactions. (3) Horizontal scrolling performance breaks with >6 months of timeline data.

**2nd choice:** `vis-timeline` (Apache-2.0/MIT) — not Svelte-native but framework-agnostic, more community behind it, handles dense data well. Needs imperative wrapper.

**3rd choice:** `SVAR Svelte Gantt` MIT tier — if PRO features (critical path, auto-scheduling) are eventually needed, upgrade path exists. Currently too low-community for primary dep.

---

### Layer 3 — Burndown / Velocity Charts
**Pick:** `LayerChart` (MIT)

Rationale: Svelte-native composable primitives. Burndown = area/line with threshold line; velocity = stacked bar per sprint. Tailwind-compatible. In the shadcn-svelte ecosystem orbit. 1.2k stars is low but growing; d3 underneath means fallback is viable.

**Failure gates:** (1) Chart types needed (e.g., cumulative flow diagram) not yet in LayerChart and composing from d3 primitives is too complex. (2) SSR rendering breaks (PGlite is client-side, but reports may be server-rendered). (3) Library abandoned.

**2nd choice:** `Chart.js` (MIT) — 67k stars, zero abandonment risk. Svelte `<canvas>` binding is trivial. Less composable but proven for burndown/velocity patterns.

**3rd choice:** `Apache ECharts` (Apache-2.0) — for complex custom dashboards. Bundle weight (400kB+) is a cost; tree-shaking available.

---

### Layer 4 — Command Palette / Keyboard-First
**Pick:** `shadcn-svelte Command` (Bits UI primitive, MIT)

Rationale: Already in stack (shadcn-svelte). cmdk-sv was deprecated in its favor. Svelte 5 runes-native, owned component = full customization. Supports fuzzy search, grouping, keyboard navigation, and dialog mode (Cmd+K). Zero extra deps.

**Failure gates:** (1) Bits UI's Command component cannot support deeply nested action trees (>2 levels) without significant custom work. (2) Performance lags with >1000 indexed items (backlog items + commands combined). (3) Bits UI introduces breaking changes.

**2nd choice:** `ninja-keys` (MIT) — Web Component, truly framework-agnostic, good for global hotkey registration as a *complement* to the palette rather than replacement. Lower customization ceiling.

**3rd choice:** Implement from scratch using Svelte's `use:` action + a headless combobox primitive from Bits UI — viable given the owned-component model.

---

### Layer 5 — Tables / Backlog / List Views
**Pick:** `TanStack Table v8` + `TanStack Virtual` (both MIT)

Rationale: Headless; full sort/filter/group/pagination/column-pin. 27.9k stars. Svelte 5 community workaround is documented and stable. v9 (native Svelte 5) in alpha — upgrade path clear.

**Failure gates:** (1) TanStack v9 ships with breaking API that invalidates v8 workarounds, requiring full rewrite. (2) Virtual adapter's Svelte 5 scroll-binding bug (issue #866) causes blank lists in production. (3) Complex row grouping + virtualization together causes layout bugs.

**2nd choice:** `AG Grid Community` (MIT) with community Svelte 5 wrapper — more features out of box (row DnD, multi-select) but heavier bundle and no official Svelte support.

**3rd choice:** `@humanspeak/svelte-virtual-list` (MIT) for simpler list views without full table semantics — lighter, Svelte 5 native, good for activity feeds and simple task lists.

---

## 9. Gaps — What No OSS Tool Covers (Must Build)

These are components where ≥75% of the domain need is NOT met by any single OSS library without substantial custom work:

| Gap | Why No OSS Covers It | Build Approach |
|-----|---------------------|----------------|
| **Sprint planning board** (drag issues from backlog → sprint, with capacity tracking, story points, velocity preview) | WeKan/Kanboard = kanban only; no sprint/capacity model. Plane covers it but is a full server app (AGPL). | Compose: TanStack Table (backlog) + svelte-dnd-action (drag to sprint) + custom capacity state (PGlite) |
| **Burndown chart with PGlite live queries** | LayerChart is rendering-only; no query binding. No library combines chart with local Postgres reactive queries. | LayerChart + PGlite live query subscription → derived Svelte store |
| **Custom fields engine** (user-defined field types: text, select, number, date, relation; stored in PGlite schema) | No OSS PM library ships an embeddable custom fields runtime for client-side Postgres. | Build field type registry + PGlite JSON column or dynamic table per field type; Zod for validation |
| **Saved views / filter presets** (cross-field query builder, save/restore, share-by-URL) | shadcn-svelte has no query builder component. TanStack Table column filters are column-scoped, not composable cross-entity. | Build filter AST (inspired by Plane/Linear query model); serialize to URL params + PGlite WHERE clauses |
| **Task dependency graph** (blocker/blocked-by DAG, critical path highlight, inline resolve) | No Svelte-native DAG renderer exists. vis-timeline handles timeline, not graph topology. | d3-dag or custom SVG DAG with svelte-gantt as timeline backing; or simple list-view deps without visual graph |
| **Keyboard-first bulk operations** (multi-select with shift+click, cmd+click; bulk state change, bulk assign, bulk label) | TanStack Table has row selection but no keyboard-driven bulk action dispatch pipeline. ninja-keys/shadcn Command handle single actions only. | Compose: TanStack row selection + custom keyboard event store + shadcn Command as bulk action dispatcher |
| **Local-first sync** (offline edits in PGlite, sync to server Postgres when online) | PGlite + Electric SQL solves sync but no PM-domain-specific conflict resolution exists. | PGlite + ElectricSQL shape sync + custom CRDT/LWW conflict rules for sprint/issue state |
| **Velocity / cycle metrics computation** | No library computes PM velocity metrics from raw issue state history. | SQL queries over PGlite event log (issue state transitions) + LayerChart rendering |

---

## 10. Summary Decision Table

| Layer | Winner | License | Risk Level |
|-------|--------|---------|-----------|
| Kanban DnD | svelte-dnd-action | MIT | Low |
| Gantt / Timeline | svelte-gantt + frappe-gantt | MIT | Medium (low community) |
| Charts | LayerChart | MIT | Low-Medium |
| Command Palette | shadcn-svelte Command (Bits UI) | MIT | Low |
| Table / Backlog | TanStack Table v8 + Virtual | MIT | Medium (Svelte 5 beta adapter) |
| PM Domain Schema | Plane API schema (reference only) | AGPL (reference, not embedded) | None |

**License verdict:** All selected deps are MIT or Apache-2.0. AGPL tools (Plane, Vikunja, Leantime) are used for **schema reference only** — no code embedding.

---

## Sources

- [Plane GitHub](https://github.com/makeplane/plane) — AGPL-3.0, 48.6k stars, v1.3.0 Apr 2026
- [Focalboard GitHub](https://github.com/mattermost-community/focalboard) — Apache-2.0, 26.1k stars, archived
- [OpenProject GitHub](https://github.com/opf/openproject) — GPL-3.0, 15k stars, v17.3.1 Apr 2026
- [WeKan GitHub](https://github.com/wekan/wekan) — MIT, 20.9k stars, v9.03 Apr 2026
- [Vikunja GitHub](https://github.com/go-vikunja/vikunja) — AGPL-3.0, 4.1k stars, v2.3.0 Apr 2026
- [Kanboard GitHub](https://github.com/kanboard/kanboard) — MIT, 9.6k stars, v1.2.52 Apr 2026
- [Leantime GitHub](https://github.com/Leantime/leantime) — AGPL-3.0, 9.7k stars, v3.7.3 Mar 2026
- [Tegon GitHub](https://github.com/tegonhq/tegon) — AGPL-3.0, 1.9k stars, **archived Jun 2025**
- [svelte-dnd-action GitHub](https://github.com/isaacHagoel/svelte-dnd-action) — MIT, 2.1k stars
- [pragmatic-drag-and-drop GitHub](https://github.com/atlassian/pragmatic-drag-and-drop) — Apache-2.0, 12.6k stars
- [SortableJS GitHub](https://github.com/SortableJS/Sortable) — MIT, 31.1k stars, v1.15.7 Feb 2026
- [formkit/drag-and-drop GitHub](https://github.com/formkit/drag-and-drop) — MIT, 1.9k stars, v0.5.3 Apr 2025
- [frappe-gantt GitHub](https://github.com/frappe/gantt) — MIT, 6k stars, v1.0.3 Feb 2025
- [vis-timeline GitHub](https://github.com/visjs/vis-timeline) — Apache-2.0/MIT, 2.3k stars, v8.5.0 Dec 2025
- [svelte-gantt GitHub](https://github.com/ANovokmet/svelte-gantt) — MIT, 618 stars
- [SVAR Svelte Gantt GitHub](https://github.com/svar-widgets/gantt) — MIT (open), 225 stars
- [LayerChart GitHub](https://github.com/techniq/layerchart) — MIT, 1.2k stars, v1.0.13 Jan 2026
- [Chart.js GitHub](https://github.com/chartjs/Chart.js) — MIT, 67.4k stars, v4.5.1 Oct 2025
- [Apache ECharts GitHub](https://github.com/apache/echarts) — Apache-2.0, 66.2k stars, v6.0.0 Jul 2025
- [ApexCharts GitHub](https://github.com/apexcharts/apexcharts.js) — Dual (MIT/Commercial), 15.1k stars, v5.10.6 Apr 2026
- [cmdk-sv GitHub](https://github.com/huntabyte/cmdk-sv) — MIT, **deprecated May 2025** → use Bits UI Command
- [ninja-keys GitHub](https://github.com/ssleptsov/ninja-keys) — MIT, 1.7k stars
- [kbar GitHub](https://github.com/timc1/kbar) — MIT, 5.2k stars, React-only
- [TanStack Table GitHub](https://github.com/TanStack/table) — MIT, 27.9k stars, Apr 2026
- [AG Grid GitHub](https://github.com/ag-grid/ag-grid) — MIT (community), 15.3k stars, v35.2.1 Apr 2026
- [Plane API / Epics schema](https://developers.plane.so/api-reference/epics/overview)
- [shadcn-svelte Command (Bits UI)](https://www.shadcn-svelte.com/docs/components/command)
- [ApexCharts license](https://apexcharts.com/license/)
