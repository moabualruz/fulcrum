# Implementation Plan: Fulcrum CLI Agent OS

**Branch**: `specs/003-fulcrum-cli-agent-os` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-fulcrum-cli-agent-os/spec.md`

## Summary

Fulcrum becomes a local-first CLI agent operating system for one developer/operator running many projects and CLI agents on normal workstations. This implementation plan turns the canonical 2026-04-24 roadmap into traceable delivery slices from M0 through M12. It is a planning artifact only; it does not implement the roadmap.

Primary approach:

- Keep Fulcrum-owned canonical local state in Rust kernel/daemon/CLI, SQLite/WAL, local events, policies, tasks, runs, artifacts, setup receipts, graph refs, and adapter mappings.
- Keep external products as optional adapters or sidecars. Plane, Windmill, LightRAG, Zoekt, LanceDB, Docker, and model providers must not own canonical Fulcrum state.
- Default install stays `core`. `code`, `memory`, `actions`, `full`, remote providers, model downloads, telemetry export, Docker sidecars, and external sync remain opt-in or profile-gated.
- Treat derived code, memory, graph, search, vector, LightRAG, and context-pack data as rebuildable from canonical sources.
- Use `setup doctor` as readiness authority. `setup plan` is read-only; `setup install` mutates only selected Fulcrum-managed assets and writes receipts; `setup install --json` emits JSONL step events.
- Deliver in release bands: Local Alpha M0-M2, Useful Alpha M0-M6, Adapter Beta M0-M8, Release Candidate/Beta Hardening M0-M12.

## Technical Context

**Language/Version**: Rust workspace for kernel, daemon, CLI, Tauri backend, setup, adapters, event store, SQLite migrations, file watching, and indexing orchestration. TypeScript for cockpit UI and product-facing integration glue. Python isolated to supervised LightRAG sidecar or optional ML helper processes.

**Primary Dependencies**: SQLite/WAL local store; Tauri/TypeScript cockpit; Tree-sitter parser registry; Zoekt lexical/path/regex code search; LanceDB semantic/hybrid retrieval or explicit fallback; LightRAG memory graph RAG sidecar; OpenTelemetry vocabulary for local events/traces with optional export; Docker Compose only for selected `actions`/`full` sidecars; provider-neutral OpenAI-compatible model endpoints.

**Storage**: Fulcrum home under `$HOME/.fulcrum` on Linux/macOS and `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` on Windows until packaging finalization. Canonical state in SQLite/events/files. Setup receipts and lock under `manifests/`. Derived state under `indexes/`, `parsers/`, `sidecars/`, and rebuildable graph/retrieval stores.

**Testing**: Clean-machine smoke scripts per supported OS band; real SQLite migration/event/replay tests; setup doctor smoke tests for each profile; real project code index/search/update/delete/rename fixtures; markdown/L0 memory import/update/delete/query fixtures; worktree/review/merge/conflict fixtures; privacy/network-deny/redaction/ignore-rule gates; adapter certification reports before optional adapter promotion.

**Target Platform**: Local developer/operator machines on Linux, macOS, and Windows, with exact alpha/beta/RC OS matrix deferred to release gates. No cloud credentials, remote model, Docker, Kubernetes, remote DB, telemetry backend, or external PM product required for `core`.

**Project Type**: Local-first agent OS roadmap/spec feature in an existing Rust/TypeScript workspace. This feature defines delivery artifacts and contracts; code implementation belongs to later tasks.

**Performance Goals**: First-run and `core` workflows must run on normal workstations without sidecars. Code/memory/profile operations must expose progress, bounded batches, resumability, cancellation after current batch, p50/p95 latency traces, and degraded states. Quantitative local model/LightRAG thresholds are deferred to M10/M12 gates.

**Constraints**: No hidden network calls in `core`; no auto-download of large models; no host package manager or privileged global binary mutation by default; no Docker requirement for `core`, `code`, or `memory`; no Visual Studio Build Tools or shell-only scripts for default Windows setup; remote providers and telemetry must be explicit opt-in with privacy/cost status.

**Scale/Scope**: Single-user local workspaces/projects across tasks, runs, events, cockpit, code intelligence, markdown/L0 memory, graph refs, worktrees, setup profiles, optional actions, optional PM adapter, release validation, backup/restore, import/export, reset, rebuild-index, and uninstall.

## Source Traceability

- Canonical roadmap: `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`
- Model/provider defaults: `docs/research/2026-04-24-model-recommendations.md`
- Product stack choices: `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- Cross-OS setup: `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- Roadmap input extraction: `docs/plans/roadmap-inputs/*.md`
- Active feature spec: `specs/003-fulcrum-cli-agent-os/spec.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` file exists in this checkout, and `.specify/scripts/bash/setup-plan.sh --json` is missing. Per user instruction, this plan uses `specs/002-rag-roadmap-delivery` as precedent and records the missing Spec Kit files as process gate failures rather than inventing constitution text.

- **Local Control Plane First**: PASS. Fulcrum owns local state, eventing, policy, setup, doctor, and adapter boundaries. Optional sidecars cannot own canonical task/run/state.
- **Durable Invariants Over Intent**: PASS WITH REQUIREMENTS. State machines, setup receipts, event replay, migration ledgers, backup/restore, and one-terminal-run rules must be modeled as typed persisted contracts with validation tests.
- **Agent-Native Parity With Safe Tools**: PASS WITH REQUIREMENTS. Human CLI/TUI/cockpit and agent JSON/JSONL outputs must share canonical data and stop on `blocked` states.
- **Profile Isolation**: PASS. `core` remains usable without code, memory, actions, Plane, Windmill, Docker, model provider, or remote sync.
- **Security And Privacy Are Default Gates**: PASS WITH REQUIREMENTS. Local-only, loopback-only, no hidden network, redaction, ignore rules, purge, backup preservation, and remote opt-in warnings are hard release gates.
- **Observable And Recoverable Execution**: PASS. Setup, index, memory import, queries, worktrees, actions, adapters, validation, backup, restore, and uninstall all require events, health, receipts, artifacts, or reports.
- **Simple Typed Adapter Boundaries**: PASS WITH REQUIREMENTS. Product integrations must enter through adapters with health, ID mapping, provenance, offline/degraded behavior, and certification.

Post-design re-check: PASS WITH PROCESS FAILURES. Design artifacts satisfy the available constitution precedent, but missing Spec Kit setup script/template/constitution and initially missing `AGENTS.md` remain process-gate failures documented below.

## Project Structure

### Documentation (this feature)

```text
specs/003-fulcrum-cli-agent-os/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-agent-os-contracts.md
└── checklists/
    └── requirements.md
```

### Source Code (future implementation map)

```text
crates/
├── fulcrum-cli/
├── fulcrum-daemon/
├── fulcrum-kernel/
├── fulcrum-config/
├── fulcrum-events/
├── fulcrum-storage/
├── fulcrum-setup/
├── fulcrum-code-index/
├── fulcrum-memory/
├── fulcrum-graph/
├── fulcrum-worktree/
├── fulcrum-actions/
├── fulcrum-policy/
├── fulcrum-worker/
└── fulcrum-desktop/

apps/
└── cockpit/

adapters/
├── lancedb/
├── lightrag/
├── plane/
├── windmill/
└── zoekt/
```

**Structure Decision**: Follow current workspace ownership. Rust crates own durable local behavior, adapters, setup, and worker boundaries. `apps/cockpit` owns UI. `adapters/*` document sidecar/product integration seams.

## Phase 0: Research Output

Research is captured in [research.md](./research.md). Resolved decisions:

- Fulcrum-owned local kernel and cockpit are primary; Plane is optional adapter only.
- Rust is primary for durable control plane; TypeScript is UI/glue; Python is isolated sidecar/helper only.
- `core` is default. Setup profile readiness is gated by real doctor smoke checks.
- `setup install` is real and receipt-backed, while `setup plan` remains preview.
- Model provider contract is provider-neutral OpenAI-compatible configuration with local-first recommendations and explicit remote opt-in.
- Code intelligence combines Tree-sitter, Zoekt, LanceDB or explicit fallback, exact-first ranking, bounded semantic jobs, and graph refs.
- Memory uses markdown/L0/L1 provenance and LightRAG sidecar behind Fulcrum-owned source IDs and OS graph refs.
- Worktrees, Windmill actions, and Plane PM sync remain downstream after core state and cockpit are reliable.
- Open roadmap choices are deferred to milestone gates or adapter certification, not unresolved placeholders.

## Phase 1: Design Output

Design artifacts:

- [data-model.md](./data-model.md)
- [contracts/cli-agent-os-contracts.md](./contracts/cli-agent-os-contracts.md)
- [quickstart.md](./quickstart.md)

Agent context update:

- Created root `AGENTS.md` with Spec Kit markers because no agent context file existed and the plan skill requires updating the plan reference.

## Implementation Strategy

### Slice M0: Core Bootstrap And Local State

Deliver local binary skeleton, `init`, `up`, `down`, `status`, `doctor`, `validate core`, SQLite/WAL storage, migration ledger, local event store, daemon PID/socket/lockfile, loopback health endpoint, backup manifest, restore verify, import/export/reset/rebuild-index/uninstall preview contracts, and network-deny first-run smoke.

Gate: Local state is created only after explicit operator command; state survives restart; backup restore verifies schema and canonical records; uninstall preview preserves backups.

### Slice M1: Task, Run, Event, And Artifact Loop

Deliver task/run/action/artifact/policy schemas, lifecycle state machines, supervised stub runner, subprocess runner, heartbeat/block/fail/cancel/complete transitions, event append/replay, run watch, artifact capture, and terminal transition validation.

Gate: Invalid transitions rejected; each run reaches at most one terminal state; event replay reconstructs representative run state.

### Slice M2: Owned Cockpit / TUI Alpha

Deliver dashboard DTOs, event reducer, global board, per-project board, active runs, blockers/dependencies, artifacts, review/merge queue shell, adapter/sidecar health, policy panel, and SSE/live streams with cursor reconnect.

Gate: CLI and cockpit show same canonical state; live events update without refresh; Plane remains optional and absent by default.

### Slice M3: Code Intelligence Alpha

Deliver Tree-sitter parser registry, file classifier and ignore rules, symbol/import/chunk extraction, Zoekt install/detect/guided setup, LanceDB local store or explicit fallback, exact/path/regex search, semantic chunk search, hybrid fusion, incremental create/update/delete/rename, graph refs, and code evidence for context packs.

Gate: Real repo indexing works; exact symbol/path/phrase results outrank weak semantic matches; missing vectors degrade explicitly; code vector backlog is daemon-drained, bounded, resumable, observable, cancellable after current batch, and limited to one active slice per workspace/project/source domain.

### Slice M4: Markdown Memory And LightRAG Alpha

Deliver provider configure/presets, LightRAG uv sidecar setup, port/socket allocation decision gate, markdown import, L0 import, source ID preservation, update/delete/tombstone flows, query with provenance, LightRAG graph to Fulcrum OS graph refs, embedding model/dimension lock, and optional reranker health.

Gate: Missing provider blocks `memory` readiness with exact fix while `core` remains usable; import/update/delete changes recall; citations include source refs; vector dimension drift blocks until rebuild.

### Slice M5: Worktree Delivery Alpha

Deliver task-to-branch/worktree allocation, run-to-worktree relation, dirty/untracked/conflicted/unmerged state, artifact attachment, review queue, merge queue, real git adapter, conflict artifact, and cleanup safety.

Gate: Merge success updates task/run/artifact/queue/graph state; conflict blocks with reason; cleanup refuses unsafe dirty, unmerged, or user-owned worktrees.

### Slice M6: Setup Profiles And Sidecar Supervisor

Deliver `setup plan/install/doctor/repair/uninstall/logs`, setup lock, receipts, JSONL install events, parser bundles, LanceDB/Zoekt setup, uv/LightRAG setup, LightRAG sidecar port/socket lockfile, Docker Compose guided path, sidecar logs/ports/status, offline/no-model-download/host-tools-only flags, and cross-OS documentation.

Gate: Useful Alpha cannot be claimed until M6 passes because code/memory install and doctor proof are required. Managed install mutates only selected assets and writes receipts. Doctor runs real smoke checks.

### Slice M7: Actions / Windmill Profile

Deliver Windmill compose/env generation, Docker guided doctor, action record model, policy-before-launch, external job status mapping, log/result artifacts, and `fulcrum action run smoke`.

Gate: Windmill absent does not break `core`; Windmill cannot mutate Fulcrum run lifecycle.

### Slice M8: Optional Plane Adapter

Deliver Plane local profile, mapping table, import/export, webhook ingestion, conflict states, outage/degraded behavior, reversible mapping, and footprint report.

Gate: Fulcrum works without Plane; conflicts are visible and reversible; Plane state can be rebuilt or re-synced from Fulcrum refs.

### Slice M9: Packaging, Privacy, And RC Foundation

Deliver Linux/macOS packages, Windows packaging decision, signed artifacts where feasible, bundled cockpit assets, license notices, upgrade migration backup, rollback docs, install/privacy/troubleshooting/uninstall docs, `fulcrum validate release`, clean-machine matrix, and security gates.

Gate: First launch creates state only after explicit command; no daemon autostart; upgrade backs up before migrations; network-deny/default-local tests pass.

### Slice M10: RAG Quality And Eval Gate

Deliver unified retrieval planner, lane comparison/explanation, groundedness evals, adversarial wrong-context evals, tokenizer-aware budgets with deterministic fallback and optional provider tokenizer plugins, query embedding cache, cold-start/query latency traces with cache hit fields, source-diversity caps, and baseline/challenger comparison.

Gate: Claims map to cited spans; unsupported claims fail eval; graph evidence affects ranking/explanation; read-only retrieval does not persist traces unless requested; degraded lanes report reasons.

### Slice M11: Graph And Incremental Correctness Gate

Deliver OS graph ref schema, edge writer APIs, incremental edge invalidation, delete/rename/tombstone semantics, repair/rebuild commands, graph health doctor, and graph contribution explanations.

Gate: Normal changes do not require full rebuild; stale refs visible; graph-disabled mode degrades; rebuild repairs derived graph only; canonical IDs remain stable.

### Slice M12: Beta Hardening

Deliver clean-machine automation for all supported OSes, performance budgets, crash recovery, import/export, complete docs, migration/backup coverage, adapter certification reports, model/provider privacy warnings, and telemetry opt-in docs.

Gate: Core+code+memory daily workflow works on normal workstation; optional sidecars can be absent, installed, repaired, and removed; rollback path documented and tested; known risks have owners and target milestones.

## Release Gates

- **Local Alpha (M0-M2)**: local OS base with live task/run visibility.
- **Useful Alpha (M0-M6)**: code context, markdown memory, worktree delivery, setup profiles, and doctor/install proof.
- **Adapter Beta (M0-M8)**: optional Windmill and Plane flows certified or explicitly deferred.
- **Release Candidate/Beta Hardening (M0-M12)**: packaging, privacy, RAG quality, graph correctness, setup, recovery, docs, and adapter certification.

## Deferred Questions And Gates

These are not unresolved placeholders; each is assigned to a milestone or certification gate.

- Exact Windows default home and packaging target: M6/M9.
- Supported OS matrix for Local Alpha, Useful Alpha, RC: M6/M9/M12.
- Tree-sitter language bundle for alpha: M3/M6.
- LanceDB Rust native integration vs managed helper fallback: M3 certification.
- Zoekt binary distribution, signing, and Windows aarch64 buildability: M3/M6/M9.
- Managed uv policy: opt-in only vs packaged verified asset: M4/M6.
- LightRAG delete/rename/provenance behavior and fixed port vs dynamic lockfile vs local socket: M4/M6.
- Reranker endpoint standardization across providers: M4/M10.
- Graph stable ID scheme for files, symbols, chunks, and adapter refs: M11.
- Query embedding cache TTL/LRU and tokenizer plugin strategy: M10.
- Quantitative RAG/model/LightRAG local performance thresholds: M10/M12.
- Windmill and Plane local footprint and Docker ergonomics: M7/M8 certification.
- Real git command adapter hardening: M5.
- SQLite migration crate and async query ergonomics: M0/M12.
- Offline cache/prefetch format: M6.
- Provider catalog storage: static docs, runtime data, or both: M4/M6.

## Risk And Mitigation

- **Roadmap scope too broad**: Keep milestone gates independent and measurable. Do not claim release bands until required gates pass.
- **Adapters capture canonical state**: Enforce adapter contracts, mapping tables, policy checks, and certification before promotion.
- **Setup mutates host unexpectedly**: Restrict managed writes to `$FULCRUM_HOME`; keep host package managers, global paths, Docker, model downloads, and remote providers opt-in or guided.
- **False healthy status**: Doctor must run real smoke checks and classify dependency status as `managed`, `detected`, `guided`, `optional`, or `blocked`.
- **RAG/context overclaims**: Use cited provenance, lane contribution explanations, groundedness evals, and degraded lane reporting.
- **Privacy leakage**: Gate first-run network denial, loopback binding, redaction, ignore-rule exclusion, purge, backup preservation, and remote opt-in warnings.
- **Sidecar footprint hurts adoption**: Keep `core` sidecar-free; profile-gate code/memory/actions/full capabilities; report optional/degraded status.

## Process Gate Failures

- `.specify/scripts/bash/setup-plan.sh --json` is missing, so setup was inferred from `.specify/feature.json` and existing `specs/002-rag-roadmap-delivery` precedent.
- `.specify/memory/constitution.md` is missing, so constitution text could not be loaded. Constitution check used precedent principles from the previous feature plan.
- `.specify` templates are missing, so document structure follows `specs/002-rag-roadmap-delivery`.
- No pre-existing `AGENTS.md` agent context file was found. A minimal file with Spec Kit markers was created to satisfy the required plan reference update.
