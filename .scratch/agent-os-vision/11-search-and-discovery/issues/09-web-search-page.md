---
Status: completed
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md, 07-saved-searches.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, C4, Q38]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Web /search route: SSR + URL params + left-rail facets panel + kind-grouped result list

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-14, T11-15, T11-16)

## What to build
SvelteKit `/search` route — full-page search experience. SSR: `load` function reads URL params (`?q=`, `?kind=`, `?project=`, `?status=`, `?assignee=`, `?tag=`, `?date_from=`, `?date_to=`, `?author=`) and fetches first page from `search.query` server-side. Left-rail facets panel: kind checkboxes, project select, status multi-select, assignee select, tags input, date range pickers; selecting a facet updates URL and re-fetches. Result list: kind-grouped sections (icon + title + badge + breadcrumb + relative date); click navigates to entity detail. "Save this search" button. Pagination: "Load more" appends next page client-side.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `search.query` called server-side in `load`; client-side on facet change.
- [ ] Web surface: `/search` renders with SSR data on first load; URL params hydrate facets; facet count badges accurate; selecting `kind=doc` narrows results to docs only; removing facet chip restores; "Save this search" creates saved search with current params; Playwright test covers full flow.
- [ ] CLI command: N/A (CLI in separate slice).
- [ ] TUI screen: N/A (TUI in separate slice).
- [ ] Tests: SvelteKit `load` unit test with mock tRPC; facet chip removal test; pagination test (page 2 appends); URL param hydration (kind/project/status all parsed); Playwright: enter query, select facet, verify count narrows; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query` procedure.
- `06-suggest-and-quick-filter.md` — quick-filter chip rendering.
- `07-saved-searches.md` — "Save this search" button.

## Notes / Tech-stack hints
- SSR strategy: `export const load: PageServerLoad` calls tRPC; data passed to page; client calls tRPC on reactive facet change.
- Facet panel: shadcn-svelte `Checkbox`, `Select`, `DateRangePicker` components.
- Kind grouping: `Object.groupBy(results, r => r.kind)` (Bun + modern TS support).
- Result kind icons: task=`CheckSquare`, doc=`FileText`, memory=`Brain`, run=`Play`, artifact=`Paperclip`, repo=`GitBranch`, project=`Folder`, sprint=`Sprint`.
