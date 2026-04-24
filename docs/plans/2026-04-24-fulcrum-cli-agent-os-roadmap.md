# Fulcrum CLI Agent OS Roadmap

Date: 2026-04-24
Status: canonical roadmap draft

This roadmap combines and upgrades:

- `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`
- `docs/plans/2026-04-24-agent-os-system-design-plan.md`
- `docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md`

It is enriched from:

- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- `docs/research/2026-04-24-model-recommendations.md`
- `docs/guides/setup-profiles.md`
- `docs/spikes/agent-os-validation.md`
- `docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md`
- `docs/plans/2026-04-24-rag-design-solutions.md`
- `docs/handover/2026-04-24-rag-remaining-issues.md`

Roadmap extraction notes live in `docs/plans/roadmap-inputs/`.

## Roadmap Thesis

Fulcrum is a local-first CLI agent operating system for one developer/operator running many projects and many CLI agents on normal machines.

It is not a RAG app, not only a task tracker, not a sync wrapper for Jira/Linear/GitHub Projects/Plane, and not a team-server product. Fulcrum owns the local operating layer: tasks, runs, events, policy, memory, code intelligence, context packs, worktrees, dashboards, health, setup, backup, and agent/action orchestration.

North star:

```text
local agent OS
  + personal Linear/Jira/GitHub Projects style cockpit
  + live agent operations center
  + memory/code intelligence graph
  + worktree delivery system
```

Default product posture:

- local-first by default
- no cloud credentials required
- no remote model or sync by default
- canonical local state is inspectable and recoverable
- external products are adapters or sidecars, never source of truth
- optional products can be absent without breaking `core`
- derived indexes can be rebuilt; canonical state must survive backup/restore

Current branch status:

- This branch is an alpha/spike foundation, not a ready product.
- Real adapters are still missing or incomplete for Zoekt, LanceDB, LightRAG, real git commands, Windmill, and Plane.
- Existing implementation work should be treated as validation scaffolding until the roadmap gates below are met.

## Shipping Definition

Fulcrum is shippable to a user only when all are true:

- clean-machine install works
- daemon starts, stops, recovers, and reports health
- local state persists across restart
- CLI can run daily workflow
- cockpit/TUI shows same live state as CLI
- code index works on a real project
- markdown memory import works on a real project
- context packs are explainable and cite source refs
- graph links memory, code, PM, runs, actions, artifacts, and policies
- graph and indexes update on change, not only rebuild
- worktree delivery loop can produce, review, merge, or block artifacts
- setup doctor gives exact fixes for missing dependencies
- backup, restore, export, uninstall, and purge behavior are tested
- privacy defaults are local-only and loopback-only
- optional sidecars degrade with explicit status, not hidden failure

## Source Traceability

| Roadmap Concern | Source Detail |
|---|---|
| Product scope and non-goals | `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md` |
| Runtime/language/system boundaries | `docs/plans/2026-04-24-agent-os-system-design-plan.md` |
| Milestones, delivery gates, setup model | `docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md` |
| Product stack choices and rejected alternatives | `docs/research/2026-04-24-local-first-agent-os-product-stack.md` |
| Cross-OS setup, doctor, install/uninstall | `docs/research/2026-04-24-cross-os-adapter-setup-research.md` |
| Embedding/rerank/chat model recommendations | `docs/research/2026-04-24-model-recommendations.md` |
| User-facing setup profiles | `docs/guides/setup-profiles.md` |
| Adapter spike validation | `docs/spikes/agent-os-validation.md` |
| RAG dual-rail architecture | `docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md` |
| RAG fixes and design solutions | `docs/plans/2026-04-24-rag-design-solutions.md` |
| Remaining live RAG issues | `docs/handover/2026-04-24-rag-remaining-issues.md` |

## Capability Decisions

One primary winner per capability. Fallbacks exist only behind explicit validation failure or degraded mode; they are not duplicate active systems.

| Capability | Roadmap Winner | Fulcrum Ownership Boundary | Fallback / Escape Hatch |
|---|---|---|---|
| Kernel, daemon, CLI, local supervisor | Rust Fulcrum kernel | Fulcrum owns canonical state, config, migrations, policy, events, health, sidecar lifecycle | none |
| Cockpit UI | Owned TypeScript/Tauri cockpit | Fulcrum owns PM/operator experience | localhost web shell before desktop packaging |
| PM external surface | Optional Plane adapter only | Fulcrum remains system of record; Plane cannot own task/run identity | import/export or no Plane |
| Actions/workflows | Optional Windmill adapter | Windmill can run human-triggered scripts/workflows; Fulcrum owns agent lifecycle | owned lightweight action runner |
| Memory graph RAG | LightRAG sidecar | LightRAG owns retrieval graph; Fulcrum owns L0/L1 provenance and OS graph refs | custom SQLite/LanceDB/Kuzu memory pipeline |
| Code lexical search | Zoekt | Zoekt owns exact/path/regex index | SQLite FTS5 degraded mode |
| Code structure | Tree-sitter | Tree-sitter owns AST/symbol/chunk extraction | SCIP later for precision refs |
| Semantic/hybrid retrieval | LanceDB | LanceDB owns vector/full-text/hybrid chunk search | sqlite-vec + FTS5 degraded mode |
| Model provider contract | OpenAI-compatible endpoint config | Fulcrum records provider, model names, dimensions, privacy status, health | provider-specific adapters later |
| Telemetry naming | OpenTelemetry semantic vocabulary | Fulcrum stores local events first; export optional | local names only where no semantic convention fits |
| Setup readiness | `setup doctor` | Doctor proves actual readiness; install only safe managed assets | guided setup for large/privileged deps |

## Runtime And Language Rules

```text
Rust primary
  -> CLI
  -> daemon
  -> Tauri backend
  -> file watching
  -> adapter supervisor
  -> event store
  -> SQLite migrations
  -> setup doctor/install/uninstall
  -> indexing orchestration

TypeScript secondary
  -> cockpit UI
  -> adapter UI surfaces
  -> product API glue when JS ecosystem is better

Python isolated
  -> LightRAG sidecar only
  -> optional ML helper processes only when justified
```

Rules:

- Python must not own Fulcrum kernel state.
- External products must not mutate canonical state directly.
- Sidecars communicate through supervised adapters and typed refs.
- Canonical state is local SQLite/events/files.
- Derived indexes can be deleted and rebuilt.
- No hidden network calls in default `core`.

## Product Profiles

| Profile | Includes | Purpose | Ship Gate |
|---|---|---|---|
| `core` | kernel, SQLite, event log, CLI, daemon, setup doctor, backup/restore, owned cockpit/TUI model | usable local OS base | clean install, init, up/down/status, first task/run/watch |
| `code` | `core` + Tree-sitter + Zoekt + LanceDB or explicit fallback | explainable code context | real repo index/update/delete/query |
| `memory` | `core` + provider config + LightRAG + markdown/L0 import | memory graph RAG | import/update/delete/query with provenance |
| `actions` | `core` + Windmill profile | human-triggered scripts/workflows | action launch/log/result mapped to Fulcrum |
| `full` | `core` + `code` + `memory` + `actions` + optional Plane | complete local agent OS | daily workflow plus adapter certification |

Default install: `core`.

Default development target: `core` + `code` + markdown memory import.

## Setup And Doctor Roadmap

Setup commands:

```bash
fulcrum setup plan <profile>
fulcrum setup install <profile>
fulcrum setup doctor <profile>
fulcrum setup provider configure ...
fulcrum setup repair <profile>
fulcrum setup uninstall <profile>
fulcrum setup logs
fulcrum validate <scope>
fulcrum import <source>
fulcrum rebuild-index <scope>
fulcrum reset <scope>
```

Contract:

- `setup plan` is read-only preview.
- `setup install` mutates only safe, reversible Fulcrum-managed assets.
- `setup doctor` is readiness authority.
- `setup repair` performs bounded, receipt-aware fixes.
- `setup uninstall` preserves backups by default.
- `--json` output must be machine-readable for agents.
- Agents must stop on `blocked`; they must not guess provider choices.
- `fulcrum validate` runs release-quality checks for selected scope.
- `fulcrum import` brings external or saved local state into Fulcrum with provenance.
- `fulcrum rebuild-index` repairs derived indexes without mutating canonical records.
- `fulcrum reset` is explicit, scoped, previewable, and must not silently delete backups.

Dependency states:

| State | Meaning | Product Behavior |
|---|---|---|
| `managed` | Fulcrum can safely install under `$FULCRUM_HOME` | install creates receipts |
| `detected` | compatible host dependency exists | doctor records path/version |
| `guided` | large, privileged, OS-specific, or preference-heavy | doctor prints exact steps |
| `optional` | capability not required for selected profile | warning only |
| `blocked` | required for selected profile and unavailable | doctor fails with fixes |

Required setup lock:

```text
$FULCRUM_HOME/manifests/setup-lock.toml
```

It must record profile, OS/arch, dependency versions, source URLs or local sources, SHA-256, installed paths, health command, last result, and managed/detected/guided status.

Safe managed assets:

- `$FULCRUM_HOME/config.toml`
- `$FULCRUM_HOME/fulcrum.db`
- `$FULCRUM_HOME/events/`
- `$FULCRUM_HOME/logs/`
- `$FULCRUM_HOME/backups/`
- `$FULCRUM_HOME/manifests/`
- `$FULCRUM_HOME/bin/`
- `$FULCRUM_HOME/parsers/`
- `$FULCRUM_HOME/indexes/`
- `$FULCRUM_HOME/sidecars/lightrag/`
- generated compose/env files for optional Docker profiles

Cross-OS rules:

- Linux/macOS default home: `$HOME/.fulcrum`
- Windows default home: `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` after packaging decision
- no `/usr/local/bin` mutation by default
- no Homebrew mutation by default
- no Visual Studio Build Tools requirement for default setup
- no Docker requirement for `core`, `code`, or `memory`
- all downloads pinned and SHA-256 verified
- all downloads use temp files, atomic moves, retry-safe behavior, and setup logs recording source URL plus hash
- `install --offline`, `--no-model-download`, and `--host-tools-only` must exist

## Recommended Model Tiers

Source: `docs/research/2026-04-24-model-recommendations.md`

Provider contract:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:11434/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "qwen3:14b"
embedding_model = "qwen3-embedding:0.6b"
embedding_dimensions = 1024
reranker_model = ""
```

Ollama is a preset only. Supported presets should include `ollama-local`, `lmstudio-local`, `vllm-local`, `llama-cpp-local`, `localai`, and generic `openai-compatible`.

| Tier | Embeddings | Reranker | Chat / Extraction | Use |
|---|---|---|---|---|
| Normal local | `Qwen3-Embedding-0.6B` | `Qwen3-Reranker-0.6B` or `BAAI/bge-reranker-v2-m3` | `Qwen3-14B`, fallback `Qwen3-8B` | default recommendation |
| High local | `Qwen3-Embedding-4B` or `Qwen3-Embedding-8B` | `Qwen3-Reranker-4B` | `Qwen3-30B-A3B` or `Qwen3-32B` | workstation quality |
| Remote opt-in code | `Codestral Embed` or `voyage-code-3` | Cohere `rerank-v4.0-fast/pro` | `gpt-5`, `gpt-5.5` when API is available | best quality, explicit remote |
| Remote opt-in general | `gemini-embedding-001` or `text-embedding-3-large` | Cohere rerank | remote chat model selected by user | general RAG quality |
| Low resource | `embeddinggemma` or `all-minilm` | none or BGE fallback | `Qwen3-8B` | constrained machines |

Doctor must verify:

- provider kind and base URL
- chat endpoint smoke
- embedding endpoint smoke
- returned vector length equals configured `embedding_dimensions`
- reranker endpoint smoke when configured
- selected provider privacy status
- model/dimension lock matches existing vector indexes

If vector index exists and embedding model or dimensions changed:

```text
status=blocked
reason=embedding model/dimensions changed after indexing
fix=fulcrum index rebuild --vectors
```

## Core Data Ownership

Canonical records:

- workspace
- project
- task
- dependency/blocker
- run
- run heartbeat
- action
- artifact
- review item
- merge item
- policy decision
- local event
- graph node/ref
- graph edge
- adapter
- external mapping
- sidecar process
- index file state
- memory source
- context pack

Derived records:

- AST symbols/imports/chunks
- lexical index refs
- semantic chunk refs
- LightRAG source metadata
- context pack rankings
- retrieval traces where explicitly persisted

Rule: derived state can be rebuilt; canonical state must survive backup/restore.

## Fulcrum OS Graph

Source: `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md` and `docs/plans/2026-04-24-agent-os-system-design-plan.md`

Graph links:

- memory -> L0 source
- memory -> entity
- memory -> task/issue/plan
- task/issue/plan -> code file/symbol/chunk
- code symbol -> file
- code file -> import/dependency
- agent run -> task
- agent run -> artifact
- artifact -> code file
- action -> task/run/artifact
- policy decision -> action/run
- context pack -> memory/code evidence

Rules:

- Fulcrum OS graph is not LightRAG retrieval graph.
- LightRAG graph can inform retrieval and extraction.
- Fulcrum graph owns cross-domain refs.
- Stable IDs connect graphs.
- Create/update/delete/rename must update graph refs incrementally.
- Normal correctness must not depend on periodic full rebuild.
- Rebuild is repair, not live update mechanism.

Acceptance:

- changed file updates file/symbol/chunk refs
- deleted file removes or tombstones stale graph refs
- memory update changes retrieval and graph refs
- task/run/artifact events create graph refs
- context pack explanation shows graph contribution
- graph-disabled mode degrades explicitly

## Code Intelligence Roadmap

Source: `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`, `docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md`, `docs/handover/2026-04-24-rag-remaining-issues.md`

Code intelligence is separate from memory RAG.

Pipeline:

```text
file watcher
  -> path classifier
  -> Tree-sitter parse
  -> symbols/imports/chunks
  -> Zoekt lexical/path/regex index
  -> LanceDB semantic/hybrid index
  -> Fulcrum OS graph refs
  -> context builder
```

Search layers:

- exact identifier search
- path and filename search
- string/error search
- AST/symbol search
- imports/exports/dependencies
- semantic behavior search over code chunks
- hybrid ranking and explanation

Ranking requirements from RAG handover:

- exact symbol matches outrank weak semantic matches
- exact FTS/token matches outrank weak semantic matches
- identifier-like queries get lexical/symbol priority
- camelCase/PascalCase split identifiers are handled
- suffix matches are tested
- quoted phrase and file-path matches are tested
- one file or one memory family cannot dominate packed context

Indexer rules:

- create/update parses changed file, updates symbols/chunks, reindexes lexical, queues embeddings
- delete tombstones file refs, removes symbols/chunks/index rows, invalidates graph edges
- rename preserves file identity when provable, else delete+create
- hooks do cheap indexing and graph evidence updates only
- embeddings run through daemon/job queue with bounded batches and resumable status
- missing vectors degrade semantic lane but do not break exact search

Acceptance:

- real repo can be indexed
- create/update/delete/rename works without full rebuild
- `search_code` explains lane and ranking contribution
- stale index rows are visible and removable
- code vector backlog can be resumed safely
- daemon status uses durable SQLite counts scoped by workspace/project
- LanceDB setup smoke inserts, queries, and deletes a fixture row under `$FULCRUM_HOME/indexes/lancedb`
- Zoekt setup smoke indexes and queries a fixture project

## Memory And RAG Roadmap

Sources:

- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md`
- `docs/plans/2026-04-24-rag-design-solutions.md`
- `docs/handover/2026-04-24-rag-remaining-issues.md`

Memory scope for early/mid stage:

- markdown docs
- L0 raw memory docs
- curated L1 pages
- code-linked memory refs
- no PDF/Office requirement yet

Memory rules:

- L0 remains canonical raw source.
- LightRAG imports markdown/L0 with source IDs.
- update/delete must be incremental.
- recall must cite provenance.
- graph extraction must preserve Fulcrum IDs.
- missing provider blocks `memory` readiness, not `core`.
- query traces/context packs are read-only by default unless persist mode requested.

RAG architecture:

```text
request
  -> planner
  -> lane selection
  -> lexical/code lane
  -> memory lane
  -> semantic lane
  -> graph evidence lane
  -> fusion/rerank
  -> source-diverse context pack
  -> explanation
```

Acceptance:

- markdown import/update/delete changes query results without full rebuild
- LightRAG query returns source/provenance trace
- LightRAG setup smoke proves import/API/query against a fixture markdown set
- provider doctor proves chat and embedding endpoint health before memory profile is ready
- graph entities/relationships are enough to link into Fulcrum graph refs
- semantic lane verifies after vector backlog drains
- eval groundedness requires claims to map to cited source spans
- adversarial wrong-context evals exist
- context pack budgeting is tokenizer-aware behind local abstraction
- query embedding latency is cached/traced

## PM Cockpit Roadmap

Sources: `docs/plans/2026-04-24-fulcrum-cli-agent-os-scope.md`, `docs/plans/2026-04-24-agent-os-full-product-delivery-plan.md`

Fulcrum owns PM cockpit. Plane is optional adapter, not default source of truth.

Core views:

- global board across all projects
- per-project board
- epics/issues/tasks/plans
- blockers/dependencies
- assigned agents
- running/blocked/completed runs
- task queues
- review queues
- merge queues
- artifacts and handoffs
- current live activity
- adapter/sidecar health
- policy decisions

CLI/TUI/cockpit state must be event-driven from same canonical data.

Acceptance:

- cockpit shows same state as CLI
- live run updates stream without refresh
- global and per-project views filter same data
- blocked dependencies and policy decisions are visible
- artifacts and context packs are inspectable
- review and merge queues are usable in alpha
- Plane outage or absence does not affect core cockpit

## Agent Orchestration Roadmap

Fulcrum owns agent orchestration.

Responsibilities:

- task lifecycle
- run lifecycle
- adapter contract
- team templates
- slot policies
- workflow DAGs
- handoffs
- budgets
- heartbeats
- cancellation/block/fail/complete transitions
- live action stream

Rules:

- policy check before run/action launch
- one terminal state per run
- heartbeat/janitor detects stale work
- artifacts attach to runs
- event log records lifecycle
- adapters cannot bypass task/run state machine

Acceptance:

- stub runner and subprocess runner exist
- run can start, heartbeat, stream, complete, block, fail, or cancel
- CLI watch streams until terminal state
- run artifacts include IDs, paths, kind, size, digest, and producer refs
- invalid transitions are rejected
- no direct canonical mutation by external action runner

## Worktree Delivery Roadmap

Worktree delivery loop:

```text
task
  -> branch/worktree allocation
  -> agent run
  -> artifacts
  -> review queue
  -> merge queue
  -> merge, block, or conflict artifact
```

Acceptance:

- allocate worktree per task/run
- attach artifacts to run
- dirty/untracked state visible
- review findings attach to artifacts/files
- merge success updates task/run/graph refs
- merge conflict blocks with reason and artifact
- cleanup refuses unsafe dirty/unmerged worktree

## Actions And Windmill Roadmap

Windmill is optional and human-action oriented. It must not own agent lifecycle.

Windmill may own:

- scripts
- workflows
- forms/UIs
- webhooks
- schedules
- operator action logs

Fulcrum owns:

- task claiming
- agent run lifecycle
- heartbeats
- policy before action launch
- event stream
- mapping Windmill job IDs to Fulcrum action/task/run IDs

Acceptance:

- missing Docker/Windmill does not break `core`
- `actions` profile doctor guides Docker Compose setup
- action launch creates Fulcrum action record
- Windmill job status maps to Fulcrum action status
- logs/results attach as artifacts
- Windmill cannot mutate agent run lifecycle directly

## Plane Adapter Roadmap

Plane is optional. It can be tested as PM surface/import-export, but Fulcrum owns cockpit and canonical state.

Validation gates:

- local footprint measured on clean machine
- Docker requirement acceptable only for `full`
- mapping Plane work item -> Fulcrum task proven
- webhooks/import/export reversible
- conflicts represented explicitly
- Plane outage does not block core cockpit
- no Plane-only state required for daily workflow

If Plane is too heavy, keep it as optional sync/import-export and continue owned cockpit.

## Observability Roadmap

Local event store first. OpenTelemetry naming where useful.

Events:

- task events
- run events
- action events
- artifact events
- policy events
- index events
- retrieval events
- graph events
- setup events
- sidecar health events

Acceptance:

- event replay can reconstruct dashboard state
- SSE/live stream supports cursor-based reconnect
- local monitor/cockpit shows health and live state
- no external collector required
- OTel export optional and opt-in
- logs can be purged/redacted

## Security And Privacy Roadmap

Defaults:

- no remote model/provider by default
- no remote telemetry by default
- no external sync by default
- loopback bind
- explicit opt-in for remote endpoints
- provider privacy status visible in doctor/cockpit
- local secrets redacted from traces/logs/artifacts

Gates:

- network-deny first-run test
- secret fixture exclusion/redaction tests
- secrets excluded from default indexing and retrieval
- `.gitignore` and `.fulcrum/ignore` respected
- binary/large-file skip
- allowlist for intentional fixtures
- purge/redaction command
- backup restore does not leak outside `$FULCRUM_HOME`
- uninstall preserves backups unless explicit purge confirmation

## Milestone Roadmap

### M0: Core Bootstrap And Local State

Goal: Fulcrum can install, initialize, start daemon, persist state, report health, back up, restore, and uninstall on a clean machine.

Deliver:

- Rust workspace skeleton
- `fulcrum init`
- `fulcrum up`
- `fulcrum down`
- `fulcrum status`
- `fulcrum doctor`
- `fulcrum validate core`
- SQLite WAL storage
- ordered migration ledger
- local event store
- daemon PID/socket/lockfile
- loopback health endpoint
- backup manifest and restore verify
- non-mutating status/doctor paths where possible
- clean install smoke

Acceptance:

- no cloud credentials
- state survives daemon restart
- doctor shows exact status/fixes
- backup restore verifies schema and canonical state
- uninstall preview preserves backups
- network-deny first-run passes
- import/export/reset/rebuild-index command contracts are documented and reject unsafe scopes

### M1: Task, Run, Event, And Artifact Loop

Goal: CLI daily workflow works from task to supervised run to artifact and live watch.

Deliver:

- task schema and commands
- run schema and state machine
- heartbeat/block/fail/cancel/complete
- stub runner
- subprocess runner
- event append/replay
- `run watch`
- artifact capture
- policy decision record
- terminal transition validation

Acceptance:

- invalid transitions rejected
- watch streams until terminal state
- artifacts include metadata/digest/producer refs
- event replay reconstructs run state
- one terminal state per run

### M2: Owned Cockpit / TUI Alpha

Goal: Operator can see global/per-project live state without external PM product.

Deliver:

- dashboard DTO
- event reducer
- global board
- per-project board
- active runs
- blockers/dependencies
- artifacts
- review/merge queue shell
- adapter health panel
- policy panel
- SSE/cursor live transport

Acceptance:

- CLI and cockpit show same state
- live events update cockpit without refresh
- missing optional sidecars visible as degraded/optional
- Plane not required

### M3: Code Intelligence Alpha

Goal: Real project code search and context works across lexical, structural, semantic, and graph evidence.

Deliver:

- Tree-sitter parser registry
- file classifier and ignore rules
- symbol/import/chunk extraction
- Zoekt install/detect/guided setup
- LanceDB local store or explicit fallback
- exact/path/regex search
- semantic chunk search
- hybrid fusion
- incremental create/update/delete/rename
- graph refs
- context pack evidence

Acceptance:

- `fulcrum index project .`
- `fulcrum search code <query>`
- exact symbol hits outrank weak semantic hits
- stale rows removed or tombstoned
- missing vectors degrade cleanly
- code index doctor checks durable row counts
- LanceDB fixture smoke covers insert/query/delete
- Zoekt fixture smoke covers index/query

### M4: Markdown Memory And LightRAG Alpha

Goal: Markdown/L0 memory import, graph RAG, provenance, update/delete, and provider doctor work.

Deliver:

- provider configure command
- provider presets
- LightRAG uv sidecar setup
- LightRAG port/socket allocation strategy
- markdown import
- L0 import
- source ID preservation
- update/delete/tombstone flows
- query with provenance
- LightRAG graph to Fulcrum graph refs
- embedding model/dimension lock
- reranker support where configured

Acceptance:

- missing provider blocks memory profile with exact fix
- import/update/delete changes query results without rebuild
- query citations include source refs
- vector dimension drift blocks until rebuild
- LightRAG can be stopped without breaking `core`
- LightRAG fixture smoke proves import/API/query
- provider smoke proves chat and embedding vector dimensions

### M5: Worktree Delivery Alpha

Goal: Fulcrum can run a local delivery loop from task through worktree, review, and merge/block.

Deliver:

- worktree allocation
- branch naming
- run -> worktree relation
- artifact attachment
- review queue
- merge queue
- conflict artifact
- cleanup safety
- real git adapter

Acceptance:

- dirty worktree visible
- merge success updates state
- merge conflict blocks with reason
- cleanup refuses unsafe deletion
- artifacts/reviews link to files and runs

### M6: Setup Profiles And Sidecar Supervisor

Goal: Profiles are installable, diagnosable, repairable, and cross-OS documented.

Deliver:

- `setup plan/install/doctor/repair/uninstall/logs`
- setup lock and receipts
- progress output and JSONL events
- parser bundles
- LanceDB/Zoekt setup
- uv/LightRAG setup
- LightRAG sidecar port/socket lockfile
- Docker Compose guided path
- sidecar logs/ports/status
- offline/no-model-download/host-tools-only flags

Acceptance:

- profile install mutates only selected managed assets
- doctor smokes each selected capability
- missing dependencies show exact fixes
- uninstall preserves backups by default
- clean-machine OS smoke covers core/code/memory
- Linux, macOS, and Windows setup behavior is documented; supported alpha OS subset is explicit

### M7: Actions / Windmill Profile

Goal: Optional action workflows work without owning agent lifecycle.

Deliver:

- Windmill compose/env generation
- Docker guided doctor
- action record model
- job mapping
- log/result artifact capture
- policy before action launch

Acceptance:

- Windmill absent does not break core
- `fulcrum action run smoke` proves Windmill logs map into Fulcrum events
- action status maps to Fulcrum
- Windmill cannot directly mutate run lifecycle

### M8: Optional Plane Adapter

Goal: Validate Plane as optional PM surface/import-export, not source of truth.

Deliver:

- Plane local profile
- mapping table
- import/export
- webhook ingestion
- conflict states
- outage/degraded behavior

Acceptance:

- Fulcrum works without Plane
- Plane state can be rebuilt from Fulcrum or re-synced
- conflicts are visible and reversible
- footprint documented

### M9: Packaging, Privacy, And RC

Goal: Release candidate can be installed and trusted by users.

Deliver:

- Linux/macOS packages
- Windows packaging decision
- signed artifacts where feasible
- bundled cockpit assets
- license notices
- upgrade migration backup
- rollback docs
- install/privacy/troubleshooting/uninstall docs
- `fulcrum validate release`
- clean-machine matrix
- security gates

Acceptance:

- first launch creates state only after explicit command
- no daemon autostart without user action
- upgrade backs up before migrations
- network-deny/default-local tests pass
- uninstall/restore tested

### M10: RAG Quality And Eval Gate

Goal: RAG is reliable enough for agent context.

Deliver:

- unified retrieval planner
- lane comparison and explanations
- groundedness evals
- adversarial wrong-context evals
- tokenizer-aware budget
- query embedding cache
- cold-start/latency traces
- source-diversity caps
- baseline/challenger comparison

Acceptance:

- claims map to cited spans
- unsupported claims fail eval
- graph evidence affects ranking and explanation
- read-only retrieval does not persist traces unless requested
- degraded lanes report reason

### M11: Graph And Incremental Correctness Gate

Goal: graph correctness updates on change across memory, code, PM, runs, and artifacts.

Deliver:

- graph ref schema
- edge writer APIs
- incremental edge invalidation
- delete/rename/tombstone semantics
- repair/rebuild commands
- graph health doctor
- graph contribution explanations

Acceptance:

- normal changes do not require full rebuild
- stale refs visible
- graph-disabled mode degrades
- rebuild repairs derived graph only
- canonical IDs remain stable

### M12: Beta Hardening

Goal: product is ready for external beta users.

Deliver:

- clean-machine automation for all supported OSes
- performance budgets
- crash recovery
- import/export
- docs complete
- migration/backup coverage
- adapter certification reports
- model/provider privacy warnings
- telemetry opt-in docs

Acceptance:

- core+code+memory daily workflow works on normal workstation
- optional sidecars can be absent, installed, repaired, and removed
- rollback path documented and tested
- known risks documented with owner and target milestone

## Release Bands

| Band | Milestones | User Value |
|---|---|---|
| Local Alpha | M0-M2 | local OS base with live task/run visibility |
| Useful Alpha | M0-M6 | code context, markdown memory, worktree delivery, setup profiles proven |
| Adapter Beta | M0-M8 | optional actions and Plane adapter certified |
| RC | M0-M12 | package, privacy, RAG quality, graph correctness, docs |

## Cross-Milestone Acceptance Matrix

| Capability | Must Be True Before Useful Alpha | Must Be True Before RC |
|---|---|---|
| Setup | core/code/memory install and doctor work on one clean OS | OS matrix, offline/no-model-download, repair/uninstall complete |
| Kernel | state, events, daemon, backup/restore work | migration rollback and crash recovery tested |
| Cockpit | live state parity with CLI | polished Tauri/TUI UX, reconnect/backpressure |
| Code | real repo index/search/update/delete | quality evals, performance budgets, stale ref repair |
| Memory | markdown/L0 import/update/delete/query | groundedness evals, provider drift handling, LightRAG repair |
| Graph | refs created for task/run/code/memory/artifacts | incremental correctness gate, repair/rebuild |
| Worktrees | local delivery loop usable | real git conflict/review/merge hardening |
| Actions | not required | optional Windmill certified |
| Plane | not required | optional adapter certified or explicitly deferred |
| Security | local-only defaults, secret redaction basics | full privacy/security gate and docs |

## Adapter Certification Template

Every optional adapter must document and test:

- install strategy
- doctor health check
- profile requirement
- local footprint
- ports/processes
- external IDs
- mapping to Fulcrum refs
- CRUD/read-write contract
- update/delete semantics
- provenance
- offline behavior and offline boot behavior
- backup/restore posture
- uninstall behavior
- degraded-mode behavior
- security/privacy notes
- clean-machine smoke result

No adapter becomes default unless certification passes.

## External Research Links

Product stack:

- Plane developer docs: https://developers.plane.so/
- Windmill self-host docs: https://www.windmill.dev/docs/advanced/self_host
- Windmill GitHub: https://github.com/windmill-labs/windmill
- LightRAG: https://github.com/HKUDS/LightRAG
- LightRAG paper: https://arxiv.org/abs/2410.05779
- RAG-Anything: https://github.com/HKUDS/RAG-Anything
- Zoekt: https://github.com/sourcegraph/zoekt
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- LanceDB docs: https://docs.lancedb.com/
- LanceDB quickstart: https://docs.lancedb.com/quickstart/
- LanceDB search docs: https://docs.lancedb.com/search/
- Docker Compose install docs: https://docs.docker.com/compose/install/
- uv docs: https://docs.astral.sh/uv/
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
- Tauri: https://tauri.app/

Models:

- Qwen3 Embedding/Reranker: https://qwenlm.github.io/blog/qwen3-embedding/
- Qwen3 chat models: https://qwenlm.github.io/blog/qwen3/
- Ollama embeddings: https://docs.ollama.com/capabilities/embeddings
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Voyage `voyage-code-3`: https://blog.voyageai.com/2024/12/04/voyage-code-3/
- Mistral Codestral Embed: https://docs.mistral.ai/models/codestral-embed-25-05/
- Cohere Rerank: https://docs.cohere.com/docs/reranking
- Gemini Embedding: https://ai.google.dev/gemini-api/docs/embeddings
- OpenAI embeddings API: https://developers.openai.com/api/docs/api-reference/embeddings/create
- OpenAI GPT-5 developer docs: https://openai.com/index/introducing-gpt-5-for-developers/
- OpenAI GPT-5.5 announcement: https://openai.com/index/introducing-gpt-5-5/
- OpenAI gpt-oss: https://openai.com/index/introducing-gpt-oss/

## Open Questions

These remain design work, not blockers for roadmap structure:

- exact Windows default home and packaging target
- final OS matrix for alpha, beta, RC
- exact Tree-sitter language bundle for alpha
- LanceDB Rust native path vs sidecar/helper path
- Zoekt binary distribution strategy per OS/arch
- LightRAG delete/rename/provenance behavior under real sidecar
- Windmill local footprint and Docker ergonomics
- Plane footprint/customization fit
- SQLite migration crate choice and async query ergonomics
- event store format for high-volume streams
- graph stable ID scheme for files/symbols/chunks
- query embedding cache TTL/LRU
- token budget provider-specific tokenizer plugin strategy
- quantitative RAG quality thresholds
- measurable local model and LightRAG CPU performance threshold
- LightRAG fixed port vs dynamic port lockfile vs local socket strategy
- model version pin strategy and cost/privacy warnings

## Immediate Next Steps

1. Treat this roadmap as canonical over the three source plan docs.
2. Add README/plan pointers from the three source docs to this roadmap.
3. Turn M0-M2 into implementation issues with acceptance checks.
4. Turn M3-M4 setup and RAG gates into spike tickets before coding adapters.
5. Decide supported alpha OS matrix.
6. Define adapter certification report format.
7. Define provider config schema and setup-lock schema.
8. Define graph ref schema and incremental update contract.
9. Define code index ranking tests from RAG handover queries.
10. Define clean-machine smoke script for Local Alpha.
