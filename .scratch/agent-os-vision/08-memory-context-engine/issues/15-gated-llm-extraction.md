---
Status: implemented
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [04-heuristic-extraction-hook-agent-run.md, 05-heuristic-extraction-hook-doc-save.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q16, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Gated features — memory-llm-extract flag; graphile-worker job extract-llm-memories; pg_trgm dedup
---

## What to build

Gated LLM-driven memory extractor (`FULCRUM_FEATURES=memory-llm-extract`). Runs in parallel to the heuristic extractor after `after_run` / `after_doc_save` events via a graphile-worker job `extract-llm-memories`.

Job calls Pillar 2 inference sidecar `extract_facts(text) → Fact[]` (this pillar consumes the sidecar, does not implement it). Each `Fact: { body, kind, importance, confidence }`. Before writing: `pg_trgm similarity()` dedup check — skip if any existing `memories` row for same `(org_id, project_id)` has `similarity(body, existing.body) > 0.85`. Writes surviving facts with `source='llm'`.

Job timeout: 30s. Retry: 2×. Fails silently if sidecar down (logs warning; heuristic rows remain). Default OFF — zero sidecar calls when flag unset.

## Acceptance criteria

- [ ] `FULCRUM_FEATURES` unset → no `extract-llm-memories` job enqueued; no `source='llm'` rows; no sidecar calls (`feature-flags.test.ts`)
- [ ] `FULCRUM_FEATURES=memory-llm-extract` → job enqueued after `after_run` hook; job runs `extract_facts(transcript)`
- [ ] Dedup: fixture with near-duplicate body (similarity 0.9) → only 1 row written; genuinely distinct bodies → both written
- [ ] Sidecar unavailable (mock timeout) → job fails silently; heuristic row still present; warning logged
- [ ] Job timeout: 30s max; exceeds → fail with logged error
- [ ] Retry: max 2× retries on non-timeout failure; 3rd attempt not made
- [ ] `source='llm'` on all written rows; `confidence` stored in `source_ref` JSON
- [ ] Integration test: flag ON + mock sidecar returning 3 facts → 3 rows written (assuming no dedup collision)
- [ ] `fulcrum doctor --json` `llm_extraction` subsystem: `disabled` when flag off, `ok`/`degraded` when on

## Blocked by

- `04-heuristic-extraction-hook-agent-run.md`
- `05-heuristic-extraction-hook-doc-save.md`
