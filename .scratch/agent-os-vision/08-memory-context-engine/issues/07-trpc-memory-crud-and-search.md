---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [06-retriever-bm25-recency-importance.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q15, Q22, Q28, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Surfaces — API (tRPC always-on procedures); PRD §Manual memory CRUD
---

## What to build

tRPC router `src/server/routers/memory.ts` with all always-on procedures:

- `memory.create` — write manual memory; sets `source='manual'`
- `memory.get` — fetch single row by id; org_id enforced
- `memory.list` — paginated list; filters: `projectId`, `global`, `kind`, `tags`, `importance`, `archived`, `source`
- `memory.update` — edit `body`, `importance`, `tags` (manual rows only; heuristic/llm rows require `edit-requires-confirmation` flag in input)
- `memory.archive` — set `archived=true`
- `memory.restore` — set `archived=false`
- `memory.forget` — hard delete; org-admin only; requires explicit `confirm: true` in input
- `memory.promote` — set `global=true`
- `memory.search` — calls `retrieve()` from slice 06; deterministic results match retriever unit output on same seed

Every procedure: Zod-validated input, `assertPermission()` guard, `org_id` scoped from tRPC context (never from client input).

## Acceptance criteria

- [ ] All 9 procedures defined and exported from memory router
- [ ] `memory.create` rejects `source` values other than `'manual'` from client (heuristic/llm sources set by internal hooks only)
- [ ] `memory.update` returns 403 for heuristic/llm rows unless `forceEdit: true` passed (confirmation modal path)
- [ ] `memory.forget` returns 403 without `confirm: true`; hard-deletes when confirmed
- [ ] `memory.search` returns same top-20 as direct `retrieve()` call with identical seed and query (`retriever.determinism.test.ts` extended)
- [ ] Org isolation: all procedures enforce `org_id` from context; cross-org access returns 404 not 403
- [ ] `memory.list` pagination: `cursor`-based or `offset`-based with `limit` cap
- [ ] `assertPermission()` called on every procedure (lint-enforced per Pillar 1 rule)
- [ ] Unit tests in `src/server/routers/__tests__/memory.test.ts` covering all 9 procedures
- [ ] `bun run ci` type-check passes with no `any` on procedure inputs/outputs

## Blocked by

- `06-retriever-bm25-recency-importance.md`
