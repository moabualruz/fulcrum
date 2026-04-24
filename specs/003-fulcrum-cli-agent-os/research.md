# Research: Fulcrum CLI Agent OS

**Feature**: [Fulcrum CLI Agent OS](./spec.md)
**Created**: 2026-04-24
**Research method**: Source-grounded synthesis from the canonical roadmap, model recommendations, local-first product stack research, cross-OS setup research, roadmap input extraction files, and the active feature spec. No new online research was needed for this planning artifact.

## Source-Grounded Decisions

### Decision 1: Fulcrum-owned local OS is the product center

**Decision**: Fulcrum must own canonical local state, cockpit/TUI, CLI, event stream, policy, setup, backup/restore, graph refs, task/run lifecycle, and context construction.

**Rationale**: The roadmap thesis says Fulcrum is a local agent OS, not a RAG app, external PM wrapper, or team-server product. Optional products can be absent without breaking `core`.

**Alternatives considered**:
- Plane-owned PM cockpit: rejected as default. Plane remains optional adapter/import-export/sync candidate.
- Windmill-owned agent lifecycle: rejected. Windmill may run human-triggered actions only.
- Cloud/team server first: rejected because local-first, single-operator operation is the target.

**Sources**:
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/plans/roadmap-inputs/local-first-agent-os-product-stack.md`

### Decision 2: Use Rust for durable control plane, TypeScript for cockpit, Python only behind sidecars

**Decision**: Rust owns kernel, daemon, CLI, Tauri backend, file watching, adapter supervision, event store, SQLite migrations, setup, and indexing orchestration. TypeScript owns cockpit UI and product glue. Python is isolated to LightRAG or justified ML helper processes.

**Rationale**: Rust fits durable local OS behavior and cross-OS setup. TypeScript is appropriate for UI velocity. Python ecosystem value is real for LightRAG/ML, but Python must not own Fulcrum state.

**Alternatives considered**:
- TypeScript-only kernel: rejected for durable daemon/setup/state ownership.
- Python control plane: rejected because sidecar environment drift would own too much product risk.
- Rewriting all adapter UI in Rust: rejected because UI/product glue benefits from TypeScript ecosystem.

**Sources**:
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- `docs/plans/roadmap-inputs/agent-os-system-design-plan.md`

### Decision 3: Make `setup doctor` the readiness authority

**Decision**: `setup plan` is read-only preview, `setup install` performs real selected managed setup, `setup doctor` proves readiness with smoke checks, and install receipts plus setup lock become required state.

**Rationale**: Cross-OS setup research identifies current dry-run install behavior as insufficient. Doctor must classify each dependency as `managed`, `detected`, `guided`, `optional`, or `blocked` with exact fixes.

**Alternatives considered**:
- Keep `install` as preview: rejected because users and agents need real setup.
- Mutate host package managers or global paths: rejected for local-first safety and reversibility.
- Require Docker for setup: rejected for `core`, `code`, and `memory`; Docker is only guided/profile-gated for `actions`/`full`.

**Sources**:
- `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- `docs/plans/roadmap-inputs/cross-os-adapter-setup-research.md`
- `specs/003-fulcrum-cli-agent-os/spec.md`

### Decision 4: Keep provider contract neutral and local-first

**Decision**: Fulcrum exposes a provider-neutral OpenAI-compatible model configuration contract with chat/extraction, embedding, optional rerank, model names, dimensions, provider kind, and privacy status. Ollama is a preset only.

**Rationale**: The roadmap and model recommendations require stable model/dimension metadata before indexing, explicit remote opt-in, and no automatic large model downloads.

**Alternatives considered**:
- Require Ollama: rejected because it is useful but should not be a hard dependency.
- Hide remote provider status: rejected because privacy/cost warnings are release gates.
- Allow silent embedding dimension drift: rejected because it corrupts vector compatibility.

**Sources**:
- `docs/research/2026-04-24-model-recommendations.md`
- `docs/plans/roadmap-inputs/model-recommendations.md`

### Decision 5: Treat setup profiles as product gates, not convenience labels

**Decision**: `core`, `code`, `memory`, `actions`, and `full` are capability bundles with install, doctor, repair, uninstall, logs, validation, and degraded/blocked behavior.

**Rationale**: Useful Alpha depends on setup proof. A feature cannot claim code or memory readiness unless profile setup and doctor validate the dependencies and fixture behavior.

**Alternatives considered**:
- Let optional sidecars fail silently: rejected because cockpit/doctor must show capability impact.
- Combine all setup into `full`: rejected because `core` must remain lightweight and reliable.

**Sources**:
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- `docs/plans/roadmap-inputs/setup-profiles.md`
- `docs/plans/roadmap-inputs/roadmap-review.md`

### Decision 6: Build code intelligence as exact + structural + semantic + graph

**Decision**: Code intelligence uses Tree-sitter structure, Zoekt exact/path/regex search, LanceDB semantic/hybrid retrieval or explicit fallback, durable file/index state, and Fulcrum OS graph refs.

**Rationale**: The roadmap requires exact identifiers, file paths, quoted phrases, suffix/camel-case matching, dependencies, symbols, semantic behavior, incremental updates, and lane explanations. Code RAG is separate from memory RAG.

**Alternatives considered**:
- Memory-only RAG for code: rejected because code needs file/symbol/line/import semantics.
- Semantic-only code search: rejected because exact code queries must outrank weak semantic hits.
- Full rebuild as normal correctness path: rejected because create/update/delete/rename must update incrementally.

**Sources**:
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- `docs/plans/roadmap-inputs/rag-design-solutions.md`
- `docs/plans/roadmap-inputs/rag-remaining-issues.md`

### Decision 7: Build memory RAG with provenance and separate graph ownership

**Decision**: Memory imports markdown/L0/L1 sources with source IDs, update/delete/tombstone behavior, provider readiness checks, citations, LightRAG retrieval graph integration, and Fulcrum-owned OS graph refs.

**Rationale**: LightRAG can own retrieval graph behavior, but Fulcrum must preserve provenance, source IDs, update/delete effects, graph linkability, and canonical local ownership.

**Alternatives considered**:
- Treat LightRAG graph as Fulcrum OS graph: rejected because retrieval graph and cross-domain OS graph have different ownership and identity rules.
- Let missing provider degrade silently: rejected because memory readiness must be blocked with exact setup guidance.

**Sources**:
- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`

### Decision 8: Use SSE/live streams with cursor-based reconnect

**Decision**: CLI watch and cockpit live state use SSE/live streams with cursor-based reconnect/replay semantics.

**Rationale**: The spec clarification selected this transport. It fits local loopback operation, event replay, cockpit parity, and agent-visible state.

**Alternatives considered**:
- Poll-only dashboard: rejected because live run supervision requires one propagation cycle.
- External observability collector as default: rejected because local events are primary and export is optional.

**Sources**:
- `specs/003-fulcrum-cli-agent-os/spec.md`
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`

### Decision 9: Release bands are milestone gates, not marketing labels

**Decision**: Local Alpha is M0-M2, Useful Alpha is M0-M6, Adapter Beta is M0-M8, and Release Candidate/Beta Hardening is M0-M12.

**Rationale**: Roadmap review found Useful Alpha must include M6 because setup profiles and doctor proof are prerequisites for useful code/memory claims. The canonical roadmap resolves this as M0-M6.

**Alternatives considered**:
- Useful Alpha at M0-M5: rejected because setup profile proof would be missing.
- Adapter Beta before certification: rejected because optional adapters must pass install, health, mapping, CRUD/update/delete, offline, backup/restore, uninstall, privacy, and footprint gates.

**Sources**:
- `docs/plans/roadmap-inputs/roadmap-review.md`
- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`

## Clarification Defaults Chosen From Sources

1. **Install behavior**: `plan` previews; `install` mutates only selected managed assets and writes receipts.
2. **Agent setup output**: `setup install --json` emits JSONL step events.
3. **Live event transport**: SSE/live streams with cursor-based reconnect.
4. **Semantic backlog policy**: daemon-drained jobs, bounded batches, one active slice per workspace/project/source domain, cancellation after current batch, and resumable recovery.
5. **Context budget and latency proof**: tokenizer-aware budgets with deterministic fallback, optional tokenizer plugins, and traced query embedding cache/cold-start latency.
6. **Useful Alpha band**: M0-M6, not M0-M5.
7. **Default provider posture**: no required provider for `core`; memory provider is blocked until configured and smoked.

## Product Requirements Sharpened

- Setup profile readiness is a release gate, not a documentation nicety.
- Adapter certification must include CRUD/update/delete semantics and offline boot behavior.
- Privacy acceptance covers indexing and retrieval, not only logs/traces/artifacts.
- Code and memory smoke tests must use real fixture import/index/query/update/delete behavior.
- Model/provider decisions must carry privacy status, dimensions, and drift handling into cockpit and doctor.
- RAG/context quality must separate exact, semantic, graph, provenance, budget, cache, latency, and degraded lane evidence.

## Deferred Gates

- Windows home path and packaging: M6/M9.
- OS matrix: M6/M9/M12.
- LanceDB native vs helper path: M3 certification.
- Zoekt binary distribution/signing: M3/M6/M9.
- LightRAG supervision/port/socket/delete behavior: M4/M6.
- Local model/LightRAG numeric performance thresholds: M10/M12.
- Windmill and Plane footprint: M7/M8 certification.
- Graph stable ID scheme: M11.

## Source Index

- `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- `docs/research/2026-04-24-model-recommendations.md`
- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- `docs/plans/roadmap-inputs/*.md`
- `specs/003-fulcrum-cli-agent-os/spec.md`
