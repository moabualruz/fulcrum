---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [07-trpc-memory-crud-and-search.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [C4, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Surfaces — Web /memory list + /memory/<id> detail + Settings panel
---

## What to build

Three web routes for the memory surface:

**`/memory`** — org-level memory browser. Filter sidebar: project, kind, importance, tags, date range, source, archived toggle. Results list: body preview, kind badge, importance dot, source chip. Search via `memory.search` tRPC. Bulk action bar on multi-select: promote, archive, tag.

**`/memory/[id]`** — detail page. Full body (markdown rendered), metadata inline-editable for manual rows (confirmation modal for heuristic/llm), `source_ref` link to producing run/doc, linked entities via `memory_links`, archive/promote/restore buttons.

**Project Settings → Memory tab** — retriever weight sliders (`bm25_weight`, `recency_weight`, `importance_boost`) stored in `project_settings.memory_config jsonb`; token budget input; reset defaults button.

## Acceptance criteria

- [ ] `/memory` renders list of memories with filter controls; filters trigger re-fetch via `memory.list` tRPC
- [ ] `/memory` search box calls `memory.search`; debounced 300ms
- [ ] Multi-select → bulk action bar shows with promote/archive/tag actions
- [ ] `/memory/[id]` renders full body, metadata, source_ref link, linked entities list
- [ ] Edit metadata inline for `source='manual'` rows; confirmation modal for `source='heuristic'|'llm'` rows
- [ ] Archive/promote/restore buttons call correct tRPC procedures; optimistic update on click
- [ ] Project Settings Memory tab: sliders save to `memory_config`; retriever integration test confirms weights respected in scoring
- [ ] Web routes protected by `assertPermission()` (session required; org membership enforced)
- [ ] Playwright e2e: create memory via `remember`, find it on `/memory`, archive it, confirm archived=true in DB
- [ ] All SvelteKit routes type-check clean (`bun run ci` `web:check` passes)

## Blocked by

- `07-trpc-memory-crud-and-search.md`
