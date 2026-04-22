# Implementation Plan: Fulcrum RAG Lifecycle Hardening

**Branch**: `001-rag-lifecycle-hardening` | **Date**: 2026-04-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-rag-lifecycle-hardening/spec.md`

## Summary

Fulcrum needs one trusted operational path for RAG-derived state: reset/rebuild, embedding jobs, vector metadata, code-index parity, explainable recall, provenance, graph coverage, health checks, and eval gates. The implementation should land in incremental slices, starting with lifecycle safety and reports, then durable embedding jobs, unified code indexing, explain contracts, health/eval surfaces, and graph-quality expansion.

Primary technical approach:
- Keep canonical data in vault raw files, vault curated files, project files, and explicit config.
- Treat SQLite rows, FTS5 tables, sqlite-vec tables, Kuzu graph state, and eval reports as derived or operational state that can be rebuilt and audited.
- Build full rebuild output in staged or quarantined candidate state and promote it to served search state only after all required parity checks pass.
- Snapshot canonical source identities and content hashes at full rebuild start; before promotion, revalidate that the snapshot is still current.
- Complete embedding jobs with item failures as `degraded`, preserving failed items for retry without reprocessing completed current items.
- Gate default golden RAG evals in CI only for changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures.
- Add additive SQLite migrations for job ledgers, vector metadata, rebuild reports, job events, and eval runs.
- Route CLI and MCP through registry-backed handlers where applicable.
- Reuse existing memory/package boundaries: `@fulcrum/core` owns schema and shared types, `@fulcrum/memory` owns rebuild/index/recall/eval primitives, `@fulcrum/cli` owns command surfaces, and `@fulcrum/monitor` owns read-only visibility.

## Technical Context

**Language/Version**: TypeScript ESM on Node 24.14.1 in this workspace; package TypeScript targets remain repo-defined.  
**Primary Dependencies**: pnpm 10.33.0 workspace packages; `better-sqlite3`, `sqlite-vec`, `@huggingface/transformers`, optional `kuzu`, Hono monitor, Vitest.  
**Storage**: SQLite core DB, FTS5 virtual tables, sqlite-vec `vec0` virtual tables, L0/L1 vault markdown files, optional Kuzu graph store, JSON report artifacts.  
**Testing**: Vitest with real in-memory SQLite; package tests under `packages/<pkg>/src/tests/`; root `pnpm test`; targeted package tests first.  
**Target Platform**: Local-first developer machines and agent hosts using the Fulcrum CLI and monitor.  
**Project Type**: TypeScript pnpm monorepo with CLI, MCP, local monitor, memory subsystem, worker adapters, and integration artifacts.  
**Performance Goals**: Full rebuild is bounded and resumable; staged candidates are promoted only after verification and source-snapshot freshness checks; embedding work survives interruption; default evals stay fast enough for targeted CI gates; model-heavy and accelerator-heavy checks are opt-in.  
**Constraints**: No implicit network calls in core/memory/policy/planning; no synchronous LLM or embedding calls on memory write path; ESM relative imports need `.js`; persisted enums require SQLite `CHECK`; task lookups stay workspace-scoped.  
**Scale/Scope**: Workspace-scale RAG over vault files and project files. Initial implementation should prove parity on fixture corpora and real workspace counts before optimizing large-corpus throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Control Plane First**: PASS. Work strengthens local control-plane state, CLI/MCP surfaces, memory lifecycle, monitor visibility, and eval gates. Runtime-specific model execution remains behind existing embedding providers and worker boundaries.
- **Durable Invariants Over Intent**: PASS WITH REQUIREMENTS. New persisted statuses must use shared union types and DB `CHECK` constraints. New IDs must use `newId(<type>)`. Guard tests must cover enum columns.
- **Memory Is Source-Controlled Knowledge**: PASS. L0 remains canonical. L1, FTS, vector, and graph state are treated as derived or operational and rebuildable.
- **Agent-Native Parity With Safe Tools**: PASS WITH REQUIREMENTS. New CLI operations need MCP/action parity where agents need them. Destructive execution is limited to human operators, `chief_of_staff`, `memory_curator`, and roles with write-code/edit-file capability; all execution needs explicit scope, authorization, dry-run/report support, and audit events.
- **Test-First, Real Boundaries**: PASS. Migrations and behavior require real in-memory SQLite tests; no DB mocks.
- **Security And Policy Are Default Gates**: PASS WITH REQUIREMENTS. Reports, logs, evals, explanations, and job events must redact secrets and provider config.
- **Observable And Recoverable Execution**: PASS. Durable job events, reports, status surfaces, and monitor readouts directly satisfy this principle.
- **Simple, Typed, ESM-Publishable Code**: PASS. Implementation should add typed primitives inside owning packages and avoid new runtime-wide abstractions until multiple call sites need them.

Post-design re-check: PASS if contracts and data model below are followed. No constitution violations require complexity tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-rag-lifecycle-hardening/
├── plan.md
├── research.md
├── review.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rag-lifecycle-contracts.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/core/src/
├── db/schema.ts
├── ids.ts
├── types.ts
└── tests/
    ├── check-constraints.test.ts
    ├── memory-aux-tables.test.ts
    └── schema-migration.test.ts

packages/memory/src/
├── setup/rebuild.ts
├── setup/backfill-code-files.ts
├── l2/embed.ts
├── l2/code.ts
├── l2/queue.ts
├── pci/syncer.ts
├── retrieval/v3-search.ts
├── retrieval/search-code.ts
├── eval/
└── tests/

packages/cli/src/
├── index.ts
├── tool-registry.ts
├── mcp-tools.ts
├── commands/memory-reindex-l2.ts
├── doctor.ts
└── tests/

packages/monitor/src/
├── server.ts
└── tests/
```

**Structure Decision**: Use the existing package ownership model. Add persisted shared types and migrations in `core`, operational RAG primitives in `memory`, human/agent command surfaces in `cli`, and read-only observability in `monitor`.

## Phase 0: Research Output

Research is captured in [research.md](./research.md). Resolved decisions:
- Full rebuild must verify derived text-search integrity, not only rebuild rows.
- Full rebuild must use staged or quarantined candidate state and must not promote failed candidates.
- Full rebuild must snapshot canonical inputs and fail promotion when those inputs change before verification completes.
- Vector metadata must be queryable outside vector blobs.
- Embedding jobs with failed items complete as `degraded` and expose failed-item retry.
- Requested runtime device and actual runtime device must be separate fields.
- Graph rebuild must materialize typed domain nodes/edges and explain graph contribution.
- Golden evals must distinguish retrieval relevance, ranking, answer correctness, grounding/provenance, graph expansion, and operational parity.
- Default golden RAG evals run in CI for RAG-related changes only, not every unrelated PR.

## Phase 1: Design Output

Design artifacts:
- [data-model.md](./data-model.md)
- [contracts/rag-lifecycle-contracts.md](./contracts/rag-lifecycle-contracts.md)
- [quickstart.md](./quickstart.md)

## Implementation Strategy

### Slice 1: Derived Lifecycle And Reports

Add a report-producing rebuild primitive in `@fulcrum/memory` that can:
- Plan scope without mutation.
- Create a staged or quarantined candidate for selected domains.
- Capture a canonical input snapshot at rebuild start: source identities, content hashes, and relevant config versions.
- Rebuild L0 source rows, L1 memory rows, FTS indexes, code files/chunks, vector metadata placeholders, and graph coverage where configured inside the candidate state.
- Verify parity, revalidate that the input snapshot is still current, promote the candidate only after all required checks pass, and leave previously served derived state unchanged when verification fails or the snapshot is stale.
- Emit a machine-readable report that includes candidate disposition: promoted, quarantined, discarded, failed, or cancelled.

CLI surface should expose plan, dry-run, execute, and report modes. Help/status paths must be tested as non-mutating. Execution must be authorized for human operators, `chief_of_staff`, `memory_curator`, or roles with write-code/edit-file capability; read-only plan, dry-run, status, and report surfaces remain available to less-privileged actors.

### Slice 2: Embedding Job Ledger

Add durable embedding job tables and job item tables. Route memory and code reindexing through one job runner that records:
- source identity
- source content hash
- requested and actual model/provider/device/dimensions
- status and attempts
- error state
- recovery events

Jobs with one or more item failures should reach a terminal `degraded` state instead of staying `running` indefinitely or becoming a total `failed` job. Failed-item retry must operate only on failed/stale eligible items and must not reprocess completed current items by default.

Keep model-heavy embedding tests opt-in.

### Slice 3: L2 Scope Fix And Vector Metadata

Split memory embedding scopes into all recallable memories, true v3 pages, and code chunks. Add preflight counts and `allow_empty` behavior. Record vector metadata for current, stale, skipped, and failed items.

### Slice 4: Unified Code Indexing

Make batch project indexing call the same file-level primitive as PCI incremental indexing or extract a shared primitive used by both. Enforce chunk/file parity and explicit parse/index failure state.

### Slice 5: Explain Contract And Provenance

Stabilize explanation output for memory recall and code search. Include stage ranks/scores, provider/model/device, fallback reason, latency, freshness, confidence, supersession, provenance class, and graph contribution.

### Slice 6: Health, Eval, And Monitor Readouts

Add `memory doctor` or equivalent health output, eval runner upgrades, and monitor read-only coverage. Default evals must be deterministic and local; opt-in suites may use model or accelerator paths.

Default golden RAG evals must be wired into CI only for changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures. Non-RAG changes may skip the gate while still allowing local manual eval runs.

## Risk And Mitigation

- **Schema growth risk**: Use additive migrations first, table rebuilds only when needed, and guard persisted enum columns.
- **Staged rebuild complexity**: Keep staging boundaries domain-scoped and explicit in reports; do not serve candidate state until promotion succeeds and input snapshots are revalidated.
- **Mixed old/new vector state**: Treat missing metadata as legacy/stale and report it explicitly.
- **Long-running jobs**: Persist job status/events before expensive work, make resume idempotent, and ensure degraded jobs can retry failed items without repeating completed work.
- **Destructive command misuse**: Require explicit scope, dry-run output, audit events, and tests proving help/status do not mutate.
- **Eval flakiness**: Default evals use deterministic fixture cases and structural assertions. LLM/model-based checks remain opt-in. CI gating is limited to RAG-related changes.
- **Graph scope creep**: P1 only requires coverage, rebuild participation, and explain fields. Deeper graph-quality improvements stay P2.

## Test Plan

Targeted tests before broad suite:
- `packages/core`: schema migration tests, check-constraint tests, ID guard tests for new entities.
- `packages/memory`: staged rebuild promotion/failure tests, source-snapshot stale-promotion tests, rebuild report tests, embedding job ledger tests, degraded job retry tests, vector metadata stale/current tests, code indexing parity tests, explain contract tests, eval runner tests.
- `packages/cli`: command parsing, dry-run/help non-mutation tests, destructive execution authorization tests, JSON contract tests, MCP/tool registry tests for new action parity.
- `packages/monitor`: read-only health coverage tests.
- CI config/tests: path or package gate proving default golden RAG evals run for representative RAG changes and skip unrelated non-RAG changes.

Broader verification:
- `pnpm test`
- `pnpm build`
- `pnpm run check:cycles`

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No exception needed | No simpler alternative rejected |
