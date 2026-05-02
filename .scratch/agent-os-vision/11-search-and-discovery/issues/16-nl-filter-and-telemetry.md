---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [C1, D5, Q34]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Gated: NL→filter translation (report-llm-narration flag) + search-click-telemetry writes

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-32, T11-33)

## What to build
Two gated features sharing this slice:

**NL→filter** (`FULCRUM_FEATURES=report-llm-narration`): pre-processing step before `search.query`; inference sidecar translates natural-language query ("show me docs about deployment from last week") to filter AST `{filters, facets, text}` via constrained generation prompt → AST injected into standard `search.query` call. No separate query path. Sidecar timeout (5s) → plain-text pass-through fallback.

**Search click telemetry** (`FULCRUM_FEATURES=search-click-telemetry`): `search.recordClick` tRPC procedure writes `search_clicks` row (query_hash, result_kind, result_id, position). Table always exists; writes only when flag ON. Web palette and `/search` call `recordClick` on result open.

## Acceptance criteria
- [ ] Schema migration: `search_clicks` table in `0011_search`; no new columns for NL→filter.
- [ ] tRPC procedure / module: `search.query` NL→filter pre-processing branch when flag ON; `search.recordClick` no-op when flag OFF, writes when ON; Zod-validated.
- [ ] Web surface: NL→filter ON → typing "docs about deployment last week" returns docs about deployment filtered by last-week date range; telemetry ON → clicking result writes `search_clicks` row.
- [ ] CLI command: `fulcrum search "show tasks assigned to me last sprint" --json` uses NL→filter when flag ON; plain-text fallback when OFF or sidecar timeout.
- [ ] TUI screen: NL→filter applied in TUI search overlay when flag ON.
- [ ] Tests: NL→filter OFF → plain-text pass-through; ON + sidecar mock → AST injected into query; sidecar timeout → plain-text fallback, no error; telemetry OFF → `search_clicks` empty; ON → row inserted with correct position+kind; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query` to extend.
- `06-suggest-and-quick-filter.md` — filter AST shape.
- Pillar 2 (Inference sidecar) — must be running; mock in unit tests.

## Notes / Tech-stack hints
- NL→filter prompt: constrained generation — instruct model to output ONLY valid JSON matching filter AST schema; use JSON schema as grammar constraint if sidecar supports it.
- `query_hash` for telemetry: `SHA-256(orgId + queryText + JSON.stringify(sortedFilters))` — stable across same query.
- Per C1: both gated features OFF by default; both tested in OFF + ON states.
