---
phase: 06-documents-memory-search
plan: "06"
subsystem: memory
tags: [memory, trpc, fts, ranking, promotion, tdd]
dependency_graph:
  requires: [06-03]
  provides: [memories-trpc-router, memory-service]
  affects: [memory-browser, context-bundle-service]
tech_stack:
  added: []
  patterns: [needle-di injectable, permissionedProcedure, TDD RED/GREEN]
key_files:
  created:
    - src/memory/memory-service.ts
    - src/memory/memory-service.test.ts
  modified:
    - src/trpc/routers/memories.ts
decisions:
  - "MemoryService delegates FTS to MemoryRepository.searchProjectAndGlobal; sorts in-memory for project>global tier + importance weight"
  - "delete() is soft-delete (archived=true) not hard delete — audit trail preserved"
  - "promote() uses nativeUpdate to patch only global=true, preserving projectId"
metrics:
  duration: "~15 min"
  completed: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 06 Plan 06: Memories tRPC Router + MemoryService Summary

MemoryService with FTS project>global ranking, importance weighting (high=3x/medium=2x/low=1x), promotion, and full memories tRPC router with 6 procedures.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MemoryService (TDD RED) | 46fe6045 | src/memory/memory-service.test.ts |
| 1 | MemoryService (TDD GREEN) | 6f524434 | src/memory/memory-service.ts, memory-service.test.ts |
| 2 | Wire memories tRPC router | a5bbaf70 | src/trpc/routers/memories.ts |

## Verification

- `bun test src/memory/memory-service.test.ts` — 6 pass, 0 fail
- `grep -c "list:\|get:\|search:\|create:\|promote:\|delete:" src/trpc/routers/memories.ts` — 6
- SQL project-first ordering: `sort()` places `projectId === projectId` tier above global tier
- Importance weighting: `IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 }`
- `promote()` patch: `{ global: true }` only — no `projectId` in patch object

## Deviations from Plan

**1. [Rule 1 - Bug] Test mock returned different EM object per call**
- **Found during:** Task 1 (GREEN phase — tests for promote/create failed)
- **Issue:** `getEntityManager: mock(() => ({ nativeUpdate: mock(...) }))` created new mock fn each call; test captured different instance than service called
- **Fix:** Extracted stable `em` object; `getEntityManager` always returns same reference
- **Files modified:** src/memory/memory-service.test.ts
- **Commit:** 6f524434

**2. [Rule 1 - Implementation] delete() implemented as soft-delete**
- Plan said `delete()` without specifying hard vs soft; used `archived=true` to match Memory entity's `archived` field and preserve audit trail (consistent with artifacts pattern)

## TDD Gate Compliance

- RED gate commit: `46fe6045` (test(06-06): add failing tests — 1 error, 0 pass)
- GREEN gate commit: `6f524434` (feat(06-06): implement MemoryService — 6 pass)
- REFACTOR: not needed

## Known Stubs

None — all procedures delegate to real MemoryService which calls MemoryRepository.

## Threat Flags

None — all surfaces covered by plan's threat model (T-06-13, T-06-14 mitigated).

## Self-Check: PASSED

- `src/memory/memory-service.ts` — exists
- `src/memory/memory-service.test.ts` — exists  
- `src/trpc/routers/memories.ts` — exists, 6 procedures confirmed
- Commits `46fe6045`, `6f524434`, `a5bbaf70` — all present in git log
