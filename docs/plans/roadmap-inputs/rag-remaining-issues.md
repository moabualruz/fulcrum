# RAG Remaining Issues Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/handover/2026-04-24-rag-remaining-issues.md

## Must Carry Into Roadmap
- Finish live code vector backlog: 32,565 code chunks missing current vector metadata for workspace `ws_pi-stack-plan_2f091539c497`; active job `job_01KPYF9TDS0Z3SDHF1HK77AS01` needs bounded draining until missing metadata approaches zero.
- Improve `search_code` ranking: exact symbol, exact FTS/token, identifier-like, camelCase/PascalCase, path, quoted phrase, and suffix matches must outrank weak semantic/doc-vector matches.
- Move expensive embedding work out of hook/indexer event path: hooks should do cheap code indexing and graph evidence updates; daemon/job queue should handle async resumable vector embedding.
- Fix daemon/project status counters: durable SQLite counts must reflect real indexed rows and scope by both `workspace_id` and `project_id`; process-local registry counters should be separate or renamed.
- Verify `search_context` semantic lane after backlog drains; current semantic candidates can be sparse while vectors are incomplete.
- Harden eval groundedness: scores must require answer claims to map to cited source spans, mark unsupported claims as ungrounded, and include adversarial wrong-context cases.
- Make context-pack budgeting tokenizer-aware behind a local abstraction, with deterministic fallback and optional provider/model-specific tokenizers.
- Add query-time embedding latency controls: cache query embeddings, consider daemon-warmed embedder use, and trace cold-start/query-embedding latency.
- Add daemon-driven embedding job worker loop with bounded batch size, backpressure, cancellation, status events, and manual CLI resume as recovery override.

## Milestone Impacts
- RAG health milestone blocked on vector coverage completion and post-backlog `memory doctor` verification.
- Search quality milestone needs identifier-aware sparse/query classifier work plus ranking tests before claiming reliable code retrieval.
- Indexer daemon milestone needs async embedding drain and accurate durable status reporting before watcher UX can be trusted.
- Agent context milestone needs semantic-lane verification, stricter citation grounding, and tokenizer-aware context packs before 10/10 Agent OS roadmap acceptance.
- Setup/test milestone needs explicit live commands, regression tests, and status verification paths preserved as roadmap tasks.

## Acceptance Criteria
- `./fulcrum jobs resume job_01KPYF9TDS0Z3SDHF1HK77AS01 --batch-size 16 --max-items 512 --json` can be repeated safely without oversized batches or false failed bounded slices.
- `./fulcrum jobs status job_01KPYF9TDS0Z3SDHF1HK77AS01 --json` and `./fulcrum memory doctor --json` show code vector missing metadata near zero, with no failed job items.
- `search_code` returns exact implementation/symbol hits above weak semantic matches for `refreshGraphCoverageForCodeFile` and test cases covering full identifiers, split identifiers, symbol suffixes, file paths, and mixed natural-language/code-symbol queries.
- Hook/indexer operations enqueue embedding work and avoid repeated local ONNX runtime warmup per touched file.
- Daemon status for watched projects reports durable SQLite code chunk and memory counts matching doctor output, scoped by workspace and project.
- `search_context` verification query returns current semantic candidates once vector backlog is drained.
- Eval tests fail unsupported answer claims even when retrieval found plausible context.
- Context pack tests cover tokenizer-aware budget enforcement and deterministic fallback.
- Query traces include cold-start and query-embedding latency where semantic query embedding occurs.
- Daemon embedding worker drains pending/stale job items with bounded slices and observable status, while CLI resume remains available.

## Risks / Open Questions
- Current live RAG health is degraded solely by vector coverage per handover; confirm no new failures appeared after backlog drain.
- Batch size `16` is recommended unless runtime memory behavior is remeasured; open question: target memory budget and hardware profile for larger batches.
- Exact-code ranking changes may reduce useful semantic recall unless identifier-like query classification is conservative and tested.
- Daemon-driven embedding worker needs backpressure and cancellation semantics clarified before implementation.
- Query embedding cache needs TTL/LRU sizing and invalidation rules for provider/model/device changes.
- Tokenizer-aware budget abstraction must avoid making tests nondeterministic or requiring heavyweight provider tokenizers by default.
- Handover notes stale paths for daemon status in one section; current status handler is reported at `packages/memory/src/indexer/handlers.ts`.

## Links To Preserve
- Live monitor: `http://localhost:4721`
- Workspace: `ws_pi-stack-plan_2f091539c497`
- Project: `proj_pi-stack-plan_2f091539c497`
- Active embedding job: `job_01KPYF9TDS0Z3SDHF1HK77AS01`
- Verification query:
  `./fulcrum action exec search_context --json '{"query":"RAG graph evidence incremental indexing embedding batch clamp","workspace_id":"ws_pi-stack-plan_2f091539c497","project_id":"proj_pi-stack-plan_2f091539c497","limit":5,"explain":true}'`
- Files: `packages/memory/src/retrieval/search-code.ts`, `packages/memory/src/retrieval/search-code-support.ts`, `packages/memory/src/sparse.ts`, `packages/memory/src/retrieval/context-pack.ts`
- Files: `packages/memory/src/l2/embedding-jobs.ts`, `packages/memory/src/pci/syncer.ts`, `packages/memory/src/indexer/handlers.ts`, `packages/memory/src/indexer/client.ts`, `packages/memory/src/indexer/registry.ts`
- Files: `packages/memory/src/retrieval/planner/baseline-lane.ts`, `packages/memory/src/retrieval/query-trace.ts`, `packages/memory/src/eval/roadmap/support.ts`
- Tests: `packages/memory/src/tests/search-code*.test.ts`, `packages/memory/src/indexer/tests/daemon-status.test.ts`, `packages/memory/src/tests/rag-eval-default-retriever.test.ts`, `packages/memory/src/tests/context-pack.test.ts`
- CLI files: `packages/cli/src/commands/memory-search-context.ts`, `packages/cli/src/tool-registry-rag.ts`, `packages/cli/src/commands/memory-embedding-jobs.ts`
