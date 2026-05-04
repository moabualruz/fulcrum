---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline, 22-sprint-retro-doc]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C5, Q5, Q17]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory: per-project + global row)
Docs: []
---

# Gated embeddings task search + LLM sprint summary narration

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-50, T6-51)

## What to build
Two gated features in one slice (both depend on inference sidecar, Pillar 2):
1. `FULCRUM_FEATURES=embeddings` — task title + description embedded via inference
   sidecar on create/update; hybrid FTS + cosine similarity for search-in-view filter.
2. `FULCRUM_FEATURES=report-llm-narration` — on sprint close, inference sidecar
   generates a 3-paragraph narrative from sprint metrics + completed task titles;
   narrative appended to the auto-created retro doc.

## Acceptance criteria

### Embeddings gate
- [x] Schema: `tasks` gets `ADD COLUMN IF NOT EXISTS embedding vector(1536) NULL` migration (idempotent)
- [x] Logic: `FULCRUM_FEATURES=embeddings` ON → `tasks.create` and `tasks.update` enqueue `embed-task` graphile-worker job; job calls inference sidecar, writes embedding to `tasks.embedding`
- [x] Logic: flag OFF → no embed job enqueued; `tasks.embedding` column stays null
- [x] Logic: `reports.searchTasks({projectId, text})` with flag ON → `0.6 * normalized_BM25 + 0.4 * cosine(query_embed, task_embed)` hybrid score (same algorithm as Q17)
- [x] Web: search-in-view filter text box uses hybrid search when flag ON; falls back to FTS (ILIKE) when flag OFF
- [x] CLI: `fulcrum tasks list --search "my query" --json` uses hybrid when flag ON
- [x] TUI: search box in task list uses same tRPC procedure
- [x] Tests: flag OFF → `tasks.create` does not call inference sidecar (spy)
- [x] Tests: flag ON → embedding column populated after job runs (fixture task)
- [x] Tests: hybrid score ranks paraphrase match above exact-keyword-absent match

### LLM sprint summary narration gate
- [x] Logic: `FULCRUM_FEATURES=report-llm-narration` ON → `sprint.closed` handler calls inference sidecar with prompt containing sprint metrics + completed task titles; appends 3-paragraph narrative to retro doc via `docs.update`
- [x] Logic: flag OFF → `sprint.closed` handler creates retro doc without LLM narrative
- [x] Logic: backend override syntax — `report-llm-narration:ollama` routes to Ollama backend; `report-llm-narration:openai-compatible` routes to URL+key backend (per Q5 inference sidecar design)
- [x] Web: retro doc shows LLM narrative section when flag was ON at sprint close; absent when flag was OFF
- [x] CLI: `fulcrum sprints close --json` response includes `{retro_doc_id, narrative_appended: boolean}`
- [x] TUI: sprint close confirmation shows "LLM summary will be generated" when flag ON
- [x] Tests: flag OFF → sidecar not called, retro doc body has no narrative section
- [x] Tests: flag ON → sidecar called with correct prompt shape; narrative text appended to doc
- [x] Tests: `report-llm-narration:ollama` routes to Ollama backend (mock sidecar receives correct backend field)

## Blocked by
- 07-task-crud-baseline
- 22-sprint-retro-doc (LLM narration appends to retro doc)

## Notes / Tech-stack hints
- Pillar 2 (inference sidecar) must be shipped for both gates to function; when Pillar 2 is absent, gate check logs warning and disables itself gracefully
- `embed-task` graphile-worker job defined here; inference sidecar communication via Unix socket/stdio JSON-RPC (Pillar 2 protocol)
- `vector(1536)` matches bge-small-en output dimension; if sidecar uses different model, dimension configurable via env `FULCRUM_EMBED_DIM`
