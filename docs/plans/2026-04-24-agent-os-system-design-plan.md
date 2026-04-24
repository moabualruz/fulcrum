---
date: 2026-04-24
status: active
origin: docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md
---

# Local-First CLI Agent OS System Design Plan

> Delivery note: this document defines architecture and spike units. The full user-shippable delivery plan is `docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md`.
> Canonical combined roadmap: `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`.

## Problem Frame

Build a new local-first CLI agent operating system from the recovered product direction, not from the deleted implementation. The plan starts from docs only and assumes a fresh codebase can be created later.

Origin requirements:

- `docs/brainstorms/2026-04-24-agent-os-system-design-requirements.md`
- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`

## Architecture Decision

Default language/runtime decision:

```text
Rust primary
  -> local daemon
  -> CLI
  -> Tauri shell/backend
  -> file watching
  -> adapter supervisor
  -> event store
  -> indexing orchestration

TypeScript secondary
  -> cockpit UI
  -> adapter UI surfaces
  -> scripting glue where product APIs are TypeScript-friendly

Python isolated
  -> LightRAG sidecar only
  -> no Python ownership of Fulcrum kernel state
```

Rationale:

- Tauri's model is JavaScript frontend plus Rust application logic, cross-platform, small native app profile, and system integration.
- Rust fits local-first always-on daemon work, file watching, native packaging, embedded DB access, IPC, and process supervision.
- TypeScript gives better UI velocity and typed integration with web-facing products.
- Python is accepted where a selected product requires it, but kept behind supervised sidecars.

## Programming Language Decision Matrix

| Candidate | Best Fit | Weak Fit | Decision |
|---|---|---|---|
| Rust | local daemon, CLI, Tauri backend, file watching, process supervision, embedded DBs, indexing orchestration, single-binary packaging | fastest UI iteration, broad product API glue | primary implementation language |
| TypeScript | cockpit UI, Tauri/Web frontend, adapter dashboards, product API clients, extension-facing surfaces | native daemon reliability, long-running local supervisor, binary distribution | secondary language |
| Python | LightRAG and ML/RAG ecosystem sidecars | canonical kernel state, desktop shell, default CLI/daemon | sidecar-only |
| Go | simple CLIs, services, good distribution | weaker fit with chosen Tauri shell and selected RAG ecosystem; less advantage over Rust for this product | not primary |
| Deno/Bun | scripts, local utilities, fast experiments | stable kernel/runtime boundary, native desktop backend | optional tooling only |

Language rule:

- Rust owns durable local system behavior.
- TypeScript owns operator interface and integration velocity.
- Python owns only product sidecars that already require Python.
- No external product runtime gets to own Fulcrum's canonical state.

## Selected Product Stack

| Capability Type | Winner To Validate | Fulcrum Ownership Boundary | Fallback |
|---|---|---|---|
| PM cockpit candidate | Plane | Fulcrum owns canonical task/run model; Plane is PM surface/API adapter | custom cockpit or Vikunja |
| Action/workflow orchestration | Windmill | Windmill runs human-triggered workflows; Fulcrum owns live agent lifecycle | owned runner; Temporal only for hard durability |
| Memory graph RAG | LightRAG | LightRAG owns retrieval graph; Fulcrum owns provenance and OS graph refs | Kuzu/LanceDB custom memory pipeline |
| Code lexical search | Zoekt | Zoekt owns exact/regex/path search index | SQLite FTS5 |
| Code structure | Tree-sitter | Tree-sitter owns AST/symbol/chunk extraction | SCIP later for precision refs |
| Semantic/hybrid retrieval | LanceDB | LanceDB owns vector + FTS + hybrid chunk search | sqlite-vec + FTS5 |
| Telemetry vocabulary | OpenTelemetry | Fulcrum stores local events; OTel export optional | local-only event schema |
| Desktop/local shell | Tauri | Tauri packages UI + Rust backend | web-only localhost app |

## System Design

### Kernel

Proposed future paths:

- `crates/fulcrum-kernel/`
- `crates/fulcrum-cli/`
- `crates/fulcrum-daemon/`
- `crates/fulcrum-events/`
- `crates/fulcrum-graph/`

Responsibilities:

- local workspace/project registry
- tasks/runs/artifacts/events
- sidecar lifecycle
- local DB migrations
- policy gates
- adapter contracts
- health checks
- context builder

Kernel data classes:

- canonical: workspace, project, task, run, artifact, event, policy decision, adapter ref, graph ref
- derived: retrieval chunks, code symbols, embeddings, search index rows, graph projections
- ephemeral: live process status, stream cursor, temporary workflow output

### Cockpit

Proposed future paths:

- `apps/cockpit/`
- `crates/fulcrum-desktop/`

Responsibilities:

- global board
- per-project board
- live agents/actions
- run details
- memory/code graph viewer
- review/merge queues
- health/reporting
- action launcher

Plane validation:

- If Plane can represent work items, pages, dashboards, and webhooks with acceptable local footprint, use it as a PM surface.
- If Plane is too heavy or too hard to customize, build owned cockpit first and keep Plane as optional sync/import-export.

### Action Orchestration

Proposed future paths:

- `crates/fulcrum-actions/`
- `adapters/windmill/`

Windmill owns:

- scripts
- workflows
- forms/UIs
- webhooks
- schedules
- run logs for operator actions

Fulcrum owns:

- agent run lifecycle
- heartbeats
- task claiming
- live action stream
- policy before action launch
- mapping Windmill job IDs to Fulcrum event/task/run IDs

### Memory And RAG

Proposed future paths:

- `crates/fulcrum-memory/`
- `sidecars/lightrag/`
- `adapters/lightrag/`

LightRAG validation gates:

- import markdown docs and L0 memory docs
- preserve Fulcrum source IDs in metadata
- update/replace/delete without full rebuild
- query with source/provenance trace
- expose graph entities/relationships enough to link into Fulcrum OS graph
- CPU/local model path works acceptably

### Code Intelligence

Proposed future paths:

- `crates/fulcrum-code-index/`
- `adapters/zoekt/`
- `adapters/lancedb/`

Pipeline:

```text
file watcher
  -> path classifier
  -> Tree-sitter parse
  -> symbols/imports/chunks
  -> Zoekt lexical index
  -> LanceDB semantic/hybrid index
  -> OS graph refs
  -> context builder
```

Update rules:

- create/update: parse changed file, update symbol/chunk rows, reindex lexical, re-embed impacted chunks
- delete: tombstone file refs, remove symbols/chunks, remove lexical/semantic rows, invalidate graph edges
- rename: preserve stable file identity when git/history can prove rename; otherwise delete+create

### Memory-Code-PM Graph

Graph scope:

- task -> run
- run -> action/event/artifact
- task/plan -> file/symbol/chunk
- memory -> L0 source
- memory -> entity
- memory -> task/plan/file/symbol
- file -> symbol/import/chunk
- artifact -> file
- policy decision -> action/run

Design rule:

- LightRAG graph is retrieval graph.
- Fulcrum graph is OS graph.
- IDs connect them; neither silently owns the other.

### Observability

Local event store first:

- task events
- run events
- action events
- policy events
- index events
- retrieval events
- sidecar health events

OpenTelemetry:

- use semantic conventions for naming where possible
- export optional
- collector/backend not required for default local use

## Implementation Units

### Unit 1: Architecture Spike Harness

Purpose:

- create a disposable validation workspace for product adapters without building full product.

Future files:

- `crates/fulcrum-kernel/src/lib.rs`
- `crates/fulcrum-daemon/src/main.rs`
- `crates/fulcrum-events/src/lib.rs`
- `docs/spikes/agent-os-validation.md`

Tests:

- `crates/fulcrum-kernel/tests/kernel_state.rs`
- `crates/fulcrum-events/tests/event_store.rs`

Scenarios:

- create workspace/project/task/run locally
- emit and replay events
- report health for missing adapters

### Unit 2: Product Adapter Contracts

Purpose:

- define adapter boundary before integrating products.

Future files:

- `crates/fulcrum-kernel/src/adapters.rs`
- `adapters/plane/README.md`
- `adapters/windmill/README.md`
- `adapters/lightrag/README.md`
- `adapters/zoekt/README.md`
- `adapters/lancedb/README.md`

Tests:

- `crates/fulcrum-kernel/tests/adapter_contracts.rs`

Scenarios:

- adapter can report health
- adapter can map external IDs to Fulcrum refs
- adapter cannot mutate canonical state directly

### Unit 3: Code Intelligence Spike

Purpose:

- validate Zoekt + Tree-sitter + LanceDB together on a real repo.

Future files:

- `crates/fulcrum-code-index/src/lib.rs`
- `crates/fulcrum-code-index/src/tree_sitter.rs`
- `crates/fulcrum-code-index/src/zoekt.rs`
- `crates/fulcrum-code-index/src/lancedb.rs`

Tests:

- `crates/fulcrum-code-index/tests/incremental_updates.rs`
- `crates/fulcrum-code-index/tests/context_fusion.rs`

Scenarios:

- exact identifier beats semantic hit
- changed file updates AST and semantic chunks
- deleted file removes all search and graph refs
- context builder returns explainable ranked hits

### Unit 4: Memory RAG Spike

Purpose:

- validate LightRAG for markdown docs and L0 memory docs.

Future files:

- `sidecars/lightrag/README.md`
- `adapters/lightrag/src/supervisor.rs`
- `crates/fulcrum-memory/src/import.rs`

Tests:

- `crates/fulcrum-memory/tests/lightrag_provenance.rs`
- `crates/fulcrum-memory/tests/lightrag_incremental.rs`

Scenarios:

- markdown doc import preserves source ID
- update/delete changes retrieval result without full rebuild
- query returns source/provenance trace

### Unit 5: Cockpit And Live Stream

Purpose:

- validate owned live agent operations surface before committing to Plane UI/fork.

Future files:

- `apps/cockpit/src/routes/`
- `apps/cockpit/src/components/live-runs/`
- `crates/fulcrum-desktop/src/main.rs`

Tests:

- `apps/cockpit/tests/live_stream.spec.ts`
- `crates/fulcrum-daemon/tests/sse_stream.rs`

Scenarios:

- board shows global and per-project tasks
- active run updates live
- action event appears with policy/result status
- sidecar health visible

## Research Findings Used

- Plane developer docs say Plane provides self-hosting, REST API, webhooks, and MCP server support: https://developers.plane.so/
- Windmill self-host docs describe single-instance Docker setup plus Postgres/server/worker components: https://www.windmill.dev/docs/advanced/self_host
- Windmill GitHub describes Rust backend/workers, Svelte frontend, sandboxing, many runtimes, and Docker compose setup: https://github.com/windmill-labs/windmill
- LightRAG paper describes graph structures, vector representations, dual-level retrieval, and incremental update: https://arxiv.org/abs/2410.05779
- Zoekt README documents local indexing/search commands, webserver, JSON API, BM25/context options: https://github.com/sourcegraph/zoekt
- Tree-sitter README describes incremental parsing, concrete syntax trees, robustness under syntax errors, and embeddable dependency-free runtime: https://github.com/tree-sitter/tree-sitter
- LanceDB docs describe OSS embedded local path operation like SQLite and vector/full-text/hybrid search: https://docs.lancedb.com/quickstart and https://docs.lancedb.com/search
- OpenTelemetry docs define semantic conventions across traces, metrics, logs, profiles, and resources: https://opentelemetry.io/docs/concepts/semantic-conventions/
- Tauri docs describe JavaScript frontend, Rust application logic, cross-platform support, and small native app profile: https://tauri.app/
- TypeScript docs describe typed JavaScript with better tooling at scale: https://www.typescriptlang.org/
- Deno and Bun remain useful for scripts/tooling, but not primary kernel choices: https://docs.deno.com/runtime/reference/cli/compile/ and https://bun.sh/docs

## Sequencing

1. Freeze the product stack decision document and adapter boundaries.
2. Validate language/runtime with a Rust daemon + TypeScript Tauri shell skeleton.
3. Validate code intelligence independently from memory RAG.
4. Validate LightRAG with markdown/L0 only.
5. Validate Plane local footprint and Windmill action runner.
6. Build cockpit around Fulcrum events first; integrate Plane only after it passes gates.
7. Connect OS graph refs across task/run/action/memory/code systems.

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Plane too heavy for normal machine | PM cockpit plan fails | keep owned cockpit path and use Plane optional |
| Windmill duplicates run lifecycle | orchestration confusion | hard boundary: Windmill actions, Fulcrum agent runs |
| LightRAG weak delete/provenance | memory correctness risk | fallback to custom Kuzu/LanceDB memory pipeline |
| LanceDB TS/Rust maturity gap | retrieval adapter risk | fallback to sqlite-vec + FTS5 |
| Rust slows early product iteration | velocity risk | keep UI/adapters in TypeScript; constrain Rust to kernel |
| Too many products for local default | adoption risk | sidecars are opt-in until validated; default boots with kernel/cockpit only |

## Definition Of Done For Planning Phase

- Product winners and fallbacks documented.
- Language decision documented.
- OS graph and retrieval graph boundary documented.
- Product validation gates documented.
- Implementation units have future paths and test scenarios.
- No code implementation required in this phase.
