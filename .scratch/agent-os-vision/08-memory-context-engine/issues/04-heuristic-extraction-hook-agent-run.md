---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [03-heuristic-extractor-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q16, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Heuristic extractor — agent run completion hook (after_run)
---

## What to build

`after_run` hook integration: when Symphony delivers a transcript blob after agent run completion, call `extractMemories(transcript)` and write the resulting rows to the `memories` table, populating `memory_links` for each extracted row with `target_kind='agent_run'` and `target_id=run_id`.

Hook registration lives in the Symphony orchestration layer (Pillar 3 boundary); this slice implements the handler function `src/memory/hooks/after-run-hook.ts` and the DB write path. `source_ref` carries `{ run_id, span_start, span_end }` where the extractor returns span positions.

End-to-end: complete an agent run with a fixture transcript → `memories` rows written → `memory_links` rows written linking to `agent_runs.id`.

## Acceptance criteria

- [ ] `afterRunHook(runId: string, transcript: string, ctx: TrpcContext): Promise<void>` exported from `src/memory/hooks/after-run-hook.ts`
- [ ] Calls `extractMemories(transcript)` and writes all returned rows to `memories` with `source='heuristic'`, `org_id` from context
- [ ] `memory_links` row created per memory: `target_kind='agent_run'`, `target_id=runId`
- [ ] `source_ref` JSON includes `run_id` and span positions where available
- [ ] Integration test: fixture transcript → assert N memory rows + N memory_links rows in DB post-hook
- [ ] Hook is idempotent: running twice for same `run_id` does not create duplicate rows (dedupe on `(org_id, source_ref->>'run_id', body)` or similar unique guard)
- [ ] No writes when `extractMemories` returns `[]`
- [ ] `fulcrum doctor --json` `heuristic_extractor` subsystem: `ok`

## Blocked by

- `03-heuristic-extractor-core.md`
