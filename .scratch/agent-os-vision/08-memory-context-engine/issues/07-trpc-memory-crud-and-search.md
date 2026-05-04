---
Status: completed
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

- [x] All scoped procedures defined and exported from memory router
- [x] `memory.create` rejects `source` values other than `'manual'` from client (heuristic/llm sources set by internal hooks only)
- [x] `memory.update` returns 403 for heuristic/llm rows unless `forceEdit: true` passed (confirmation modal path)
- [x] `memory.delete` hard-deletes rows by id
- [x] `memory.search` returns same ordered results as direct BM25 scoring with identical seed and query
- [x] Org isolation: all procedures enforce `org_id` from context; cross-org access returns 404 not 403
- [x] `memory.list` pagination: offset-based with `limit` cap
- [x] `assertPermission()` called on every procedure (lint-enforced per Pillar 1 rule)
- [x] Unit tests in `tests/trpc/memory.test.ts` covering create/get/list/update/delete/search
- [x] `bun run lint` type-check passes with no `any` on procedure inputs/outputs

## Blocked by

- `06-retriever-bm25-recency-importance.md`
