---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# In-context search bars: scoped search on task/doc/run/artifact/repo list views (Web)

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-21)

## What to build
Scoped search bar `<SearchBar kind="task" projectId={...} />` Svelte component embedded at the top of each list view: `/projects/<id>/board`, `/projects/<id>/docs`, `/runs`, `/artifacts`, `/repos`. Calls `search.query` with `kind` + `project_id` pre-set from parent context. Results replace the list while query is active; facet pills (status, assignee, doc_type etc.) appear above the list. Clearing query restores the original list view. Shared `SearchBar` component reused across all list views.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `search.query` with pre-set kind filter called from component.
- [ ] Web surface: task list on `/projects/<id>/board` has working search bar; typing filters tasks; facet pills appear; clear restores board; same for docs list, runs list, artifacts list, repos list; Playwright: type in task list search bar, verify results replace list, clear restores.
- [ ] CLI command: N/A (in-context search is Web/TUI only).
- [ ] TUI screen: N/A (TUI in-panel bars in separate slice).
- [ ] Tests: component unit test: `kind` + `projectId` props passed through to `search.query` call; empty query restores list; quick-filter tokens parsed; Playwright cover task list and doc list; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query` with kind filter.
- `06-suggest-and-quick-filter.md` — quick-filter tokens for status/assignee in the bar.

## Notes / Tech-stack hints
- `SearchBar` component: debounce 150ms on input; on-clear call list data source directly (no search).
- Facet pills generated from `facetCounts` in response; clicking pill appends to filter state.
- List views should conditionally render either: (a) normal list query (when search bar empty) or (b) `search.query` results (when query active) — use Svelte 5 derived state.
