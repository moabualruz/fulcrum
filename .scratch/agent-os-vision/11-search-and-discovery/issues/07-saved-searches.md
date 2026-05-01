---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q10, Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Saved searches: tRPC search.saved* CRUD + view_type='search' + scope checks

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-11)

## What to build
Implement `search.savedList`, `search.savedCreate`, `search.savedUpdate`, `search.savedDelete` tRPC procedures reusing the `saved_views` table (Q10) with `view_type='search'`. `query_json` carries `{filters, text, facets}` AST. Scope: `private` (user-only), `project` (all project members), `org` (all org members). Web: `/settings/saved-searches` CRUD page and "Save this search" button on `/search` page. CLI: `fulcrum search saved create/list/delete`. TUI: saved search list in search screen, `Enter` to load.

## Acceptance criteria
- [ ] Schema migration: `saved_views` `view_type` CHECK extended to include `'search'` (in migration 0011_search).
- [ ] tRPC procedure / module: `search.savedList/Create/Update/Delete` — Zod-validated; scope checks (private: user owns; project: `assertPermission(ctx, 'project:member')`; org: `assertPermission(ctx, 'org:member')`).
- [ ] Web surface: `/settings/saved-searches` lists all saved searches; create/edit/delete; "Save this search" button on `/search` saves current `?q=` + facets as new saved search; loading a saved search populates `/search` URL params.
- [ ] CLI command: `fulcrum search saved create --name "my search" --query-json '{"text":"foo","filters":{"kind":"task"}}' --json`; `fulcrum search saved list --json`; `fulcrum search saved delete <id>`.
- [ ] TUI screen: `S` key on search screen → saved searches list overlay; `Enter` loads selected search; new search saved with `s` key.
- [ ] Tests: create private saved search → only creator sees it; project-scoped → all project members see it; `query_json` round-trips; delete removes; `view_type` constraint enforced (wrong type → error); RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `saved_views` CHECK constraint extension.
- `05-fts-query-ranking.md` — filter AST shape defined.
- Pillar 6 (Tasks) — `saved_views` table DDL.

## Notes / Tech-stack hints
- Reuse `saved_views` table per Q10 — no new table.
- `query_json` schema: `{ text: string, filters: { kind?: string, project_id?: uuid, ... }, facets: Record<string, string[]> }` — same typed AST as `search.query` input.
- Loading a saved search: client reads `query_json`, reconstructs URL params, navigates to `/search?q=...&kind=...`.
