---
Status: implemented
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

`after_run` hook integration: when Symphony delivers a transcript blob after agent run completion, resolve `HeuristicExtractor` from the needle-di container, call `extractMemories(transcript)`, and persist the resulting entities through `MemoryRepository` and `MemoryLinkRepository`, populating `target_kind='agent_run'` and `target_id=run_id`.

Hook registration lives in the Symphony orchestration layer (Pillar 3 boundary); this slice implements `@Injectable() AfterRunMemoryHook` in `src/memory/hooks/after-run-hook.ts` and the repository write path. `source_ref` carries `{ run_id, span_start, span_end }` where the extractor returns span positions.

End-to-end: complete an agent run with a fixture transcript → `Memory` entities written → `MemoryLink` entities written linking to `agent_runs.id`.

## Acceptance criteria

- [ ] `AfterRunMemoryHook` is `@Injectable()`; `handle(runId: string, transcript: string, ctx: TrpcContext): Promise<void>` exported from `src/memory/hooks/after-run-hook.ts`
- [ ] Calls `HeuristicExtractor.extractMemories(transcript)` and writes all returned entities through `MemoryRepository` with `source='heuristic'`, `org_id` from context
- [ ] `MemoryLink` entity created per memory: `target_kind='agent_run'`, `target_id=runId`
- [ ] `source_ref` JSON includes `run_id` and span positions where available
- [ ] Integration test: fixture transcript → assert N `Memory` rows + N `MemoryLink` rows through repository reads post-hook
- [ ] Hook is idempotent: running twice for same `run_id` does not create duplicate rows (dedupe on `(org_id, source_ref->>'run_id', body)` or similar unique guard)
- [ ] No writes when `extractMemories` returns `[]`
- [ ] `fulcrum doctor --json` `heuristic_extractor` subsystem: `ok`

## Blocked by

- `03-heuristic-extractor-core.md`

## Implementation notes

- 2026-05-03 codex: RED `bun test src/memory/__tests__/after-run-hook.test.ts` → missing `../hooks/after-run-hook.ts`, 0 pass / 1 fail / 1 error.
- 2026-05-03 codex: implemented injectable `AfterRunMemoryHook` with heuristic extraction, `Memory` persistence, `MemoryLink` persistence for `target_kind='agent_run'`, source refs carrying `run_id` and spans, and idempotent same-run link writes.
- 2026-05-03 codex: GREEN `bun test src/memory/__tests__/after-run-hook.test.ts` → 4 pass / 0 fail / 14 expect.
