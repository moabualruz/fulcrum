---
phase: 04-inference-router-skills
plan: 02
subsystem: inference
tags: [embedding, dimension, model-metadata, fail-closed, vector, pgvector, fastembed]
requires:
  - phase: 04-inference-router-skills
    provides: embedding-dimension test scaffold and model-metadata module
provides:
  - Centralized embedding model metadata with fail-closed dimension enforcement
  - Dimension guards in product-kernel, memory retrieval sidecar, and scoring
  - vector(384) schema enforcement with no stale vector(1536) references
affects: [memory, search, product-kernel, inference]
tech-stack:
  added: []
  patterns:
    - "Dimension validation before every embedding write/search/score path"
    - "Fail-closed on vector length mismatch (never pad/truncate)"
    - "Centralized model metadata module with DEFAULT_EMBEDDING_DIMENSION"
key-files:
  created:
    - src/inference/model-metadata.ts
  modified:
    - src/inference/protocol.ts
    - src/inference/client.ts
    - src/inference/embedding-dimension.test.ts
    - src/product-kernel/embeddings.ts
    - src/product-kernel/embeddings.test.ts
    - src/product-kernel/inference.ts
    - src/memory/retrieval/sidecar.ts
    - src/memory/retrieval/scoring.ts
    - src/server/trpc/routers/__tests__/inference.test.ts
key-decisions:
  - "Dimension validation uses shared assertEmbeddingDimension from model-metadata.ts vs inline per-caller checks"
  - "Default fastembed model dimension is 384 per D-05/D-06; non-384 models fail closed"
  - "Sidecar embedQuerySafe catches dimension mismatch and returns null (FTS fallback) instead of throwing, consistent with its existing error-handling pattern"
  - "Product-kernel handleEmbedTaskJob and searchTasks throw on dimension mismatch (hard fail, not fallback)"
  - "Mock sidecar vectors extended from 8-dim to 384-dim to maintain test compatibility"
patterns-established:
  - "assertEmbeddingDimension is the single dimension-validation function for all embedding paths"
  - "Write/search/score all validate before operating: fail-closed not silent coercion"
requirements-completed: [INF-01, INF-06]
duration: 7min
completed: 2026-05-05
---

# Phase 04 Plan 02: Embedding Model Metadata + Dimension Enforcement Summary

**Model-metadata-derived embedding dimension enforcement: vector(384) fail-closed contract wired into every embedding write, search, and scoring path**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-05T05:12:56+02:00
- **Completed:** 2026-05-05T05:19:30+02:00
- **Tasks:** 2 (both TDD: RED+GREEN each)
- **Files modified:** 10

## Accomplishments

- Created `src/inference/model-metadata.ts` with `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_EMBEDDING_DIMENSION`, `EmbeddingModelMetadataSchema`, `getEmbeddingModelMetadata()`, `assertEmbeddingDimension()`, and `assertSchemaSupportsEmbeddingDimension()`
- Added `dimensions: number` field to `EmbedResultSchema` in protocol.ts — every embed response now carries dimension metadata
- Wired `assertEmbeddingDimension` into `InferenceClient.embed()` for automatic dimension validation on every embed response
- Wired dimension guard into `product-kernel/embeddings.ts` — `handleEmbedTaskJob` validates before DB write, `searchTasks` validates before cosine similarity
- Wired dimension guard into `memory/retrieval/sidecar.ts` — `embedQuerySafe` rejects wrong-dimension sidecar responses (returns null → FTS fallback)
- Wired dimension guard into `memory/retrieval/scoring.ts` — `rankMemoryMatchesHybrid` rejects query and stored vectors whose length != 384
- No `vector(1536)` references remain in source code
- All 28 tests pass across 4 test files (inference tRPC, dimension guard, product-kernel embed, product-kernel DB schema)

## Task Commits

Each task was committed atomically with RED/GREEN phases:

1. **Task 1: Embedding model metadata contract (TDD)**
   - `e12eae68` (test) — add failing test for embedding model metadata
   - `423892b9` (feat) — implement embedding model metadata contract

2. **Task 2: Dimension guards in write/search/score paths (TDD)**
   - `30f887ee` (test) — add failing test for dimension guards in write/search paths
   - `8fea44ed` (feat) — wire dimension guards into write/search/score paths

## Files Created/Modified

- `src/inference/model-metadata.ts` — Centralized model metadata with dimension constants, schemas, and validation functions
- `src/inference/protocol.ts` — Added `dimensions: number` to `EmbedResultSchema`
- `src/inference/client.ts` — Wire dimension validation into embed response normalization
- `src/inference/embedding-dimension.test.ts` — Update test to import from model-metadata.ts (was local function)
- `src/product-kernel/embeddings.ts` — Add `assertEmbeddingDimension` before write and search
- `src/product-kernel/embeddings.test.ts` — Add wrong-dimension rejection test, update hybrid test vectors to 384-dim
- `src/product-kernel/inference.ts` — Update default mock sidecar from 8-dim to 384-dim
- `src/memory/retrieval/sidecar.ts` — Validate sidecar response dimension, fall back to FTS on mismatch
- `src/memory/retrieval/scoring.ts` — Reject query and stored vectors != 384 before cosine loop
- `src/server/trpc/routers/__tests__/inference.test.ts` — Add `dimensions` field to mock embed results

## Decisions Made

- Dimension validation uses `assertEmbeddingDimension` from shared `model-metadata.ts` (single source of truth) instead of inline per-caller checks — every embedding path validates through one function
- Sidecar `embedQuerySafe` catches dimension mismatch and returns null (FTS fallback) instead of throwing, consistent with its existing error-handling pattern (returns null on any failure)
- Product-kernel `handleEmbedTaskJob` and `searchTasks` throw on dimension mismatch (hard fail) — embedding writes without correct dimensions is data corruption
- Mock sidecar default vectors extended from 8-dim to 384-dim — shorter mocks would fail the new dimension guards in product-kernel tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Adding `dimensions: number` to `EmbedResultSchema` caused 2 pre-existing tests to fail in the tRPC inference test because mock embed results lacked the new required field. Fixed by adding `dimensions` to both mock responses and expected values.

## TDD Gate Compliance

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 04-02 Task 1 |  ✓  |   ✓   |    —     | Pass   |
| 04-02 Task 2 |  ✓  |   ✓   |    —     | Pass   |

Both TDD tasks followed RED → GREEN discipline. No REFACTOR commits needed.

## Next Phase Readiness

- Embedding dimension enforcement complete across all paths (INF-01, INF-06)
- Ready for next plan in Phase 04 (backend probes, real model calls, etc.)
- No blockers for downstream plans

## Self-Check: PASSED

- Created file `src/inference/model-metadata.ts`: FOUND
- All 4 commits exist: e12eae68, 423892b9, 30f887ee, 8fea44ed — FOUND
- Acceptance tests: 28/28 passing across 4 test files
- Plan metadata: 9e6929b9 (docs: complete)

---

*Phase: 04-inference-router-skills*
*Completed: 2026-05-05*
