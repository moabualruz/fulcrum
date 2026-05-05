---
phase: 06-documents-memory-search
plan: 03
subsystem: memory
tags: [context-bundle, hybrid-scoring, token-budget, embeddings-flag]
dependency_graph:
  requires: []
  provides: [ContextBundleService, hybridScore-flag-gate]
  affects: [src/memory, src/db/repositories/memory, src/db/repositories/docs, src/db/repositories/orchestration]
tech_stack:
  added: []
  patterns: [constructor-injection needle-di, greedy-fill token budget, TypeScript overloads]
key_files:
  created:
    - src/memory/context-bundle-service.ts
    - src/memory/context-bundle-service.test.ts
    - src/memory/retrieval/hybrid-scoring.test.ts
  modified:
    - src/memory/retrieval/hybrid-scoring.ts
    - src/memory/retrieval/scoring.ts
    - src/db/repositories/memory/MemoryRepository.ts
    - src/db/repositories/docs/DocumentRepository.ts
    - src/db/repositories/orchestration/AgentRunRepository.ts
decisions:
  - "MemoryRepository.searchProjectAndGlobal overloaded: positional (orgId, projectId) for bundle, NormalizedRetrieverOpts for retriever — avoids coupling ContextBundleService to query-planner opts"
  - "scoring.ts caller now pre-normalizes BM25 before hybridScore call, consistent with new function contract"
  - "hybridScore options param (not 3rd positional) makes flag-gate intent explicit"
metrics:
  duration: 15m
  completed: 2026-05-05
  tasks_completed: 2
  files_modified: 7
---

# Phase 06 Plan 03: ContextBundleService + Hybrid Scoring Summary

ContextBundleService assembles 5 slices under 8000-token budget via real repository injection; hybrid scoring updated to 0.3 FTS + 0.7 cosine with embeddings flag gate.

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 1 — ContextBundleService | a0d332df | TDD: 8 tests, real repo injection, greedy token fill |
| 2 — Hybrid scoring D-26 | d3a0c429 | 0.3/0.7 weights, useEmbeddings flag gate, MEM-01 audit |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MemoryRepository.searchProjectAndGlobal signature mismatch**
- **Found during:** Task 1 implementation
- **Issue:** Existing `searchProjectAndGlobal(opts: NormalizedRetrieverOpts)` didn't match plan's expected `(orgId, projectId)` call signature
- **Fix:** Added TypeScript overload accepting `(orgId: string, projectId: string)` that builds minimal `NormalizedRetrieverOpts` internally; existing callers in retriever.ts unaffected
- **Files modified:** src/db/repositories/memory/MemoryRepository.ts
- **Commit:** a0d332df

**2. [Rule 1 - Bug] scoring.ts hybridScore call broke after signature change**
- **Found during:** Task 2 — old call `hybridScore(bm25, maxBm25, cosine)` used internal normalization; new signature requires pre-normalized ftsScore + options object
- **Fix:** Updated scoring.ts to call `normalizeBm25()` then `hybridScore(normalizedBm25, cosine, { useEmbeddings: true })`
- **Files modified:** src/memory/retrieval/scoring.ts
- **Commit:** d3a0c429

## Known Stubs

- `ContextBundleService.skillPrompts` — returns `[]` (Pillar 9 not yet landed, documented as D-29 pattern)
- `ContextBundleService.repoState` — returns `[]` (Phase 7 placeholder, per D-29)
- `DocumentRepository.getContextSummariesForProject` — stub with basic ORM query; full filtering in Pillar 7
- `AgentRunRepository.getRecentForProject` — stub with basic ORM query; full filtering in Pillar 3

These stubs do not prevent the plan goal: ContextBundleService assembles with real repository calls; stubs will be replaced by domain logic in subsequent phases.

## Threat Coverage

- **T-06-05 (Information Disclosure):** All slice retrievers filter by orgId + projectId — mitigated via constructor-injected repos
- **T-06-06 (DoS via token overflow):** TOTAL_TOKEN_BUDGET=8000 hard cap enforced via greedy fill in `fillSlice()`

## Self-Check: PASSED

- src/memory/context-bundle-service.ts: EXISTS
- src/memory/context-bundle-service.test.ts: EXISTS (8 tests pass)
- src/memory/retrieval/hybrid-scoring.ts: EXISTS (FTS_WEIGHT=0.3, COSINE_WEIGHT=0.7)
- src/memory/retrieval/hybrid-scoring.test.ts: EXISTS (11 tests pass)
- Commits a0d332df and d3a0c429: verified in git log
- No vector(1536) column declarations in non-test src/ files
