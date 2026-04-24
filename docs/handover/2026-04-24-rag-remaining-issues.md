# Fulcrum RAG Remaining Issues - 2026-04-24

This handoff captures the remaining RAG issues after roadmap hardening, live seed,
watcher startup, graph repair, and same-pass graph refresh work.

## Current Live State

- Workspace: `ws_pi-stack-plan_2f091539c497`
- Project: `proj_pi-stack-plan_2f091539c497`
- Monitor: `http://localhost:4721`
- Indexer daemon: active watch on this repository
- Seed memory: ready and searchable
- Overall RAG health: degraded only because vector coverage is incomplete
- Healthy domains: L0, L1, FTS, code index, graph
- Graph coverage: 15459 / 15459 sources current, 0 stale, 0 failed, 0 coverage gaps
- Code index: 2063 files, 33591 chunks, 0 failed files, 0 legacy chunks
- Vector coverage: 1035 current, 32565 missing code metadata, 0 failed job items
- Active code embedding job: `job_01KPYF9TDS0Z3SDHF1HK77AS01`

## Fixed In This Pass

- Health reports expose runtime profile fingerprints only; raw profile paths are not returned by default.
- `search_code` limits are clamped before candidate expansion.
- `runtime_experiments.experiment_type` has a SQLite `CHECK` guard and test coverage.
- Roadmap contract names the context-pack response `context_pack`.
- Repair-plan profile/vault mismatch was fixed so repair plans do not report a different vault than doctor for the same workspace.
- Embedding jobs now support bounded resume slices, clamp oversized batches, emit `batch_clamped`, and avoid marking bounded slices as failed.
- Transient build/test artifacts are excluded from code indexing.
- Graph evidence is refreshed in the same pass as PCI code indexing for add/update/skip/fail/rename/unlink paths.
- Historical graph drift was cleaned with one targeted graph rebuild after the same-pass graph fix landed.

## Remaining Primary Issues

### 1. Code Vector Backlog

The live workspace still has 32565 code chunks without current vector metadata.
Semantic code retrieval works for covered chunks, but coverage is incomplete.

Next commands:

```bash
./fulcrum jobs resume job_01KPYF9TDS0Z3SDHF1HK77AS01 --batch-size 16 --max-items 512 --json
./fulcrum jobs status job_01KPYF9TDS0Z3SDHF1HK77AS01 --json
./fulcrum memory doctor --json
```

Run bounded slices until missing code metadata approaches zero. Keep batch size at 16
unless runtime memory behavior is measured again.

### 2. Exact Code Search Ranking Is Weak

`search_code` now finds current code chunks, but exact symbol/FTS matches can rank below
weak vector matches. Example: `refreshGraphCoverageForCodeFile` returned a doc/vector
hit first, while the exact implementation appeared lower.

Likely fix:

- Give exact symbol and exact FTS/token matches a stronger floor.
- Penalize semantic-only matches when query is identifier-like.
- Add tests for identifier queries, camelCase symbols, file-path hints, and mixed
natural-language/code-symbol queries.

Relevant files:

- `packages/memory/src/retrieval/search-code.ts`
- `packages/memory/src/retrieval/search-code-support.ts`
- `packages/memory/src/tests/search-code*.test.ts`

### 3. Hook/Indexer Embedding Runtime Is Too Expensive Per Event

Post-hook indexing loads or warms local ONNX embedding runtime frequently. It works,
but it is too noisy and slow for many touched files.

Likely fix:

- Route embedding work through the daemon/job queue instead of doing heavy embedder work
inside each hook process.
- Keep hook path responsible for cheap code indexing and graph evidence only.
- Make vector embedding async and resumable through the existing durable job machinery.

Relevant files:

- `packages/cli/src/commands/memory-search-context.ts`
- `packages/cli/src/tool-registry-rag.ts`
- `packages/memory/src/l2/embedding-jobs.ts`
- `packages/memory/src/pci/syncer.ts`

### 4. Indexer Daemon Status Counters Are Misleading

The daemon reports the watch as active, but project-level status counters show
`code_chunks_count: 0` and `memories_count: 0`, while doctor reports 33591 code chunks
and 32840 memory rows.

Likely fix:

- Make daemon status query persistent project state from SQLite instead of process-local
empty counters, or rename counters to make process-local meaning explicit.
- Add status test covering a watched project with existing indexed rows.

Relevant files:

- `packages/memory/src/pci/daemon.ts`
- `packages/memory/src/pci/client.ts`
- `packages/memory/src/tests/daemon*.test.ts`

### 5. Search Context Semantic Lane Still Has Sparse Current Candidates

`search_context` can return lexical and graph-backed results, but semantic can be skipped
with `no current semantic candidates` while vector backlog remains. This should resolve
mostly through vector job completion, but it needs a post-backlog verification pass.

Verification query:

```bash
./fulcrum action exec search_context --json '{"query":"RAG graph evidence incremental indexing embedding batch clamp","workspace_id":"ws_pi-stack-plan_2f091539c497","project_id":"proj_pi-stack-plan_2f091539c497","limit":5,"explain":true}'
```

### 6. Eval Groundedness Is Still Not A 10/10 Signal

The default eval retriever was hardened, but Fulcrum still needs stricter answer-grounding
and citation verification before eval scores should be treated as high-confidence product
truth.

Likely fix:

- Require answer claims to map to cited source spans.
- Mark unsupported answer statements as ungrounded even when retrieval found any result.
- Add adversarial cases with attractive but wrong retrieved context.

Relevant files:

- `packages/memory/src/eval/roadmap/support.ts`
- `packages/memory/src/tests/rag-eval-default-retriever.test.ts`

### 7. Context Pack Budget Is Not Tokenizer-Aware

Context packing still primarily uses word-ish estimates. This is acceptable for rough
budgeting but not a production-grade 10/10 agent context boundary.

Likely fix:

- Add a tokenizer-aware estimator behind a small local abstraction.
- Keep provider/model-heavy tokenizers optional and disabled by default.
- Preserve deterministic fallback for tests.

Relevant files:

- `packages/memory/src/retrieval/context-pack.ts`
- `packages/memory/src/tests/context-pack.test.ts`

## Verification Already Run

- `pnpm --filter fulcrum-agent-core test` passed
- `pnpm --filter fulcrum-memory test` passed
- `pnpm --filter fulcrum-cli test` passed
- `pnpm test` passed
- `pnpm build` passed
- `pnpm run check:cycles` passed
- `git diff --check` passed
- Targeted PCI/graph tests passed

Non-gate note: `pnpm --filter fulcrum-memory exec tsc --noEmit` still fails on
pre-existing test type debt, while package build passes.

## GitHub Automation State

All GitHub workflows were changed to `workflow_dispatch` only. Push, pull request,
schedule, and tag auto-runs are disabled until explicitly restored.

