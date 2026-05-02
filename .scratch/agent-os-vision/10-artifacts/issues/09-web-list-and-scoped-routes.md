---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md, 08-preview-and-download.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, C4, Q38]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Web artifact routes: /artifacts list + filter panel + /runs/<id>/artifacts + /tasks/<id>/artifacts + /projects/<id>/artifacts disk usage

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Surfaces: Web; issues 10-10, 10-12)

## What to build
SvelteKit routes delivering the Web artifact surface. `/artifacts`: list route with filter panel (project, run, task, MIME, archived, date range) consuming `artifacts.list` tRPC; shadcn-svelte `DataTable` + filter chips + bulk archive/delete actions. `/runs/<id>/artifacts` and `/tasks/<id>/artifacts`: scoped lists embedded in run/task detail pages. `/projects/<id>/artifacts`: per-project list + disk usage stat card (total bytes, count, past-retention count) from doctor data.

## Acceptance criteria
- [ ] Schema migration: N/A — reads from `artifacts` via tRPC.
- [ ] tRPC procedure / module: `artifacts.list` with all filter params consumed; all routes call `assertPermission`.
- [ ] Web surface: `/artifacts` renders list with working filter panel; facet count updates on filter; `/runs/<id>/artifacts` shows run-scoped artifacts; `/tasks/<id>/artifacts` shows task-scoped artifacts; `/projects/<id>/artifacts` shows disk usage stat; all routes SSR on first load; Playwright: navigate each route, filter by MIME, see result.
- [ ] CLI command: N/A for this slice (CLI commands in slice 10).
- [ ] TUI screen: N/A (TUI in separate slice).
- [ ] Tests: SvelteKit load function unit tests with mock tRPC client; Playwright e2e: create artifact via CLI → visible on all three scoped Web routes; disk usage stat matches artifact count; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — `artifacts.list` procedure.
- `08-preview-and-download.md` — detail page linked from list.

## Notes / Tech-stack hints
- shadcn-svelte `DataTable` (TanStack Table v8 headless) for list; per C4 no bespoke table.
- Bulk operations: checkboxes + action bar (archive selected, delete selected) with confirmation modal for delete.
- Disk usage: query `SUM(size_bytes)`, count, count-past-retention via `artifacts.list` aggregation or dedicated `artifacts.stats` tRPC procedure.
- SSR: `load` function fetches first page server-side; client pagination via tRPC query after hydration.
