---
date: 2026-04-24
status: active
origin: docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md
---

# Local-First Agent OS Full Product Delivery Plan

## Problem Frame

The current branch has a useful architecture spike, but a spike is not a product. This plan defines the path to a shippable local-first agent OS for one developer/operator on a normal machine.

Source documents:

- `docs/research/2026-04-24-local-first-agent-os-product-stack.md`
- `docs/ideation/2026-04-24-agent-os-full-product-delivery-ideation.md`
- `docs/brainstorms/2026-04-24-agent-os-full-product-delivery-requirements.md`
- `docs/plans/2026-04-24-agent-os-system-design-plan.md`
- `docs/spikes/agent-os-validation.md`
- `docs/research/2026-04-24-cross-os-adapter-setup-research.md`
- `docs/research/2026-04-24-model-recommendations.md`

## Shipping Definition

Fulcrum is "shippable to a user" only when all are true:

- install works from a clean machine
- daemon starts, stops, recovers, and reports health
- local state persists across restart
- CLI can run the daily workflow
- cockpit shows the same state live
- code index and markdown memory import work on a real project
- context packs are explainable and cite sources
- worktree delivery loop can produce, review, and merge or block artifacts
- backup/restore and uninstall are tested
- optional products can be missing without breaking `core`
- privacy defaults are local-only

## Current Branch Status

Status after the 2026-04-24 alpha bootstrap and product-surface implementation pass:

| Milestone | Status | Notes |
|---|---|---|
| M0 Bootstrap/product skeleton | Alpha complete | Rust workspace, local paths/config, SQLite/WAL storage, real daemon process, loopback health/events endpoints, installed-binary smoke, backup/restore verification |
| M1 task/run/event loop | Alpha complete | project/task/run/artifact/event persistence, stub worker ownership, heartbeat/block/cancel/fail/complete transitions, transition policy, terminal watch loop |
| M2 cockpit/TUI | Alpha model complete | dashboard DTO/reducer covers global and per-project task board, active runs, blockers, artifacts, review/merge queues, policy decisions, adapter health, and live events; browser/TUI shell still missing |
| M3 code intelligence | Alpha model complete | persistent index snapshot, file state, create/update/delete/rename, exact/path/import/symbol/semantic search explanations, stale detection, and Tree-sitter/Zoekt/LanceDB certification contracts exist; real external binaries still not invoked |
| M4 markdown memory | Alpha model complete | markdown directory import, caller L0 IDs, update/delete/tombstones, provenance, query explanations, graph separation, and LightRAG certification contract exist; no persistent LightRAG process/socket yet |
| M5 worktree delivery | Alpha model complete | worktree allocation, artifact attachment, review queue/findings, merge queue/apply/block, conflict artifacts, and dirty cleanup refusal exist via injectable git provider; no real git command adapter yet |
| M6 sidecar/profile supervisor | Alpha dry-run complete, design corrected | setup planner and CLI dry-run model dependency plans, health checks, uninstall, cross-OS strategy, and certification gates for core/code/memory/actions/full; real managed install execution and doctor-guided dependency setup still missing |
| M7 actions/Windmill | Contract stub only | action boundary documented/tested; no Windmill runtime |
| M8 Plane adapter | Not implemented | optional adapter docs only |
| M9 packaging/security/RC | Partial | smoke/doctor/backup/export/uninstall exist; release packaging, privacy/security gates, signed artifacts, and real clean-machine OS matrix still planned |

## Architecture Decisions

### Language And Runtime

| Layer | Decision | Rationale |
|---|---|---|
| Kernel, daemon, CLI, supervisor, indexing orchestration | Rust | best fit for local daemon, process supervision, file watching, packaging, Tauri backend |
| Cockpit UI | TypeScript | best fit for rich UI, typed frontend contracts, Tauri/Web surface |
| Memory RAG sidecar | Python only behind sidecar | LightRAG ecosystem fit without Python owning kernel state |
| Product scripts/actions | Windmill profile where enabled | useful for human-triggered workflows, not agent lifecycle |

### Core Dependencies To Validate

| Concern | Primary Choice | Why | Fallback |
|---|---|---|---|
| CLI | `clap` | mature Rust CLI derive model | hand-rolled parser only for bootstrap |
| Daemon async/runtime | `tokio` | standard async runtime for Rust services | sync daemon for alpha if needed |
| Local HTTP/SSE | `axum` | practical Rust HTTP/SSE surface | Unix socket + CLI polling |
| Local DB | SQLite with WAL, Rust migration layer | inspectable, local-first, easy backup | append-only JSONL for emergency bootstrap |
| Desktop shell | Tauri 2 | Rust backend + TypeScript frontend; small native profile | localhost web app |
| TUI | `ratatui` | rich terminal dashboard for CLI-first users | plain CLI tables |
| File watching | `notify` + ignore rules | incremental index updates | manual `fulcrum index` |
| Exact code search | Zoekt | product-grade lexical/path/regex search | SQLite FTS5 |
| AST/symbols | Tree-sitter | incremental parsing and syntax chunks | language-specific simple parsers |
| Semantic/hybrid retrieval | LanceDB | embedded vector/full-text/hybrid path | SQLite FTS5 + sqlite-vec |
| Memory graph RAG | LightRAG | graph RAG fit for markdown memory | custom memory pipeline over SQLite/LanceDB |
| Memory provider contract | OpenAI-compatible endpoint contract with presets | avoids locking memory to Ollama or any one local runner | provider-specific adapters only after generic contract |
| Recommended local model tier | Qwen3 embedding/reranking/chat family | strong open local defaults across memory, code, rerank, and chat without remote dependency | embeddinggemma/all-minilm low-resource fallback; remote opt-in models for quality |
| Telemetry vocabulary | OpenTelemetry semantics | standard naming without backend dependency | local event names only |

### Planning Assumptions That Replace Deferred Blockers

| Question | Planning Decision | Validation Gate |
|---|---|---|
| Local DB and migrations | Use SQLite WAL with Rust-managed migrations. Start with `rusqlite` unless `sqlx` becomes necessary for async query ergonomics. | M0 migration tests and backup/restore smoke |
| LanceDB binding maturity | Treat LanceDB as adapter behind `CodeSemanticStore`; allow Rust sidecar/CLI bridge or TypeScript sidecar if native Rust path is weak. | M3 adapter certification chooses native or sidecar path |
| LightRAG update/delete/provenance | Treat LightRAG as supervised Python sidecar with explicit source IDs and delete/update wrapper. | M4 provenance and incremental delete tests |
| Memory LLM/embedding provider | Treat provider as generic config: base URL, chat model, embedding model, dimensions, and API key env. Ollama is a preset only. | M4 doctor must prove embedding + chat endpoints and lock embedding dimensions before indexing |
| Model recommendations | Normal local tier is `Qwen3-Embedding-0.6B`, `Qwen3-Reranker-0.6B`, and `Qwen3-14B`; high local tier is Qwen3 4B/8B embeddings/rerankers and Qwen3 30B-A3B/32B chat; remote opt-in covers Codestral Embed, voyage-code-3, Gemini/OpenAI embeddings, Cohere rerank, GPT-5/GPT-5.5. | M4/M3 doctor must display selected model tier, dimensions, privacy status, and rebuild warning on dimension drift |
| Plane/Windmill footprint | Keep both out of default profile until measured on a clean local machine. | M6/M7/M8 clean-machine profile gates |
| Secret scanning | Use layered denylist: ignore rules, binary/large-file skip, common token detector, allowlist file. | M3/M4/M9 security tests |

Current external references used for planning:

- Plane developer docs: `https://developers.plane.so/`
- Windmill self-host docs: `https://www.windmill.dev/docs/advanced/self_host`
- LightRAG project/paper: `https://github.com/HKUDS/LightRAG`, `https://arxiv.org/abs/2410.05779`
- RAG-Anything project: `https://github.com/HKUDS/RAG-Anything`
- Zoekt: `https://github.com/sourcegraph/zoekt`
- Tree-sitter: `https://github.com/tree-sitter/tree-sitter`
- LanceDB docs: `https://docs.lancedb.com/`
- OpenTelemetry semantic conventions: `https://opentelemetry.io/docs/concepts/semantic-conventions/`
- Tauri docs via Context7: `/tauri-apps/tauri-docs`

Research audit status:

- Retrieval date: 2026-04-24.
- Current docs were checked for product direction and planning assumptions, not benchmarked locally.
- Local install/runtime benchmarks remain adapter certification work, not completed research.
- Version pins must be captured when each adapter enters implementation.

## System Design Linkage

| System Design Component | Delivery Milestones | Notes |
|---|---|---|
| Kernel | M0, M1, M9 | canonical state, migrations, config, policy, IDs |
| Events | M0, M1, M2, M9 | replayable event log, SSE, diagnostics |
| Cockpit/TUI | M2, M8 | owned operator UI first, Plane optional later |
| Code Intelligence | M3 | Tree-sitter, Zoekt, LanceDB/fallback, incremental graph updates |
| Memory RAG | M4 | markdown/L0 first, LightRAG sidecar, RAG-Anything deferred |
| OS Graph | M1, M3, M4, M5 | task/run/action/memory/code/artifact/policy refs |
| Supervisor | M0, M6, M7, M8 | daemon, sidecars, logs, ports, degraded mode |
| Product Adapters | M6, M7, M8 | certification matrix before profile promotion |
| Worktree Delivery | M5 | task -> worktree -> run -> review -> merge |
| Security/Privacy | M0, M3, M4, M9 | local-only default, redaction, deny tests |

## Product Profiles

| Profile | Includes | Purpose | Ship Gate |
|---|---|---|---|
| `core` | kernel, SQLite, event log, CLI, daemon, owned cockpit/TUI, backup/restore, doctor | usable local OS base | clean install and first run |
| `code` | `core` + Tree-sitter + Zoekt + LanceDB or fallback | explainable code context | real repo index/update/delete/query |
| `memory` | `core` + LightRAG sidecar + markdown/L0 import | memory graph RAG | import/update/delete/query with provenance |
| `actions` | `core` + Windmill adapter/profile | human-triggered actions/workflows | action launch/log/result mapped to Fulcrum |
| `full` | all above + optional Plane adapter | complete agent OS | daily workflow plus product adapter certification |

Default install: `core`.

Default development target: `core` + `code` + markdown memory import.

## Setup And Doctor Model

Setup is not one locked path for every dependency. `doctor` is the authority for readiness, and `install` only performs safe, reversible managed setup.

Dependency states:

| State | Meaning | Product behavior |
|---|---|---|
| `managed` | Fulcrum can install/provision safely under `$FULCRUM_HOME`. | `setup install` creates assets and writes receipts. |
| `detected` | Compatible host dependency already exists. | `doctor` records path/version and uses it. |
| `guided` | Dependency is large, privileged, OS-specific, or user-preference-heavy. | `doctor` prints exact install and verify steps; `install` does not force it. |
| `optional` | Needed only for selected profile/capability. | Missing dependency is a warning unless that profile requires it. |
| `blocked` | Required for selected profile and neither managed nor detected. | `doctor` fails with actionable steps. |

Commands:

```bash
fulcrum setup plan core
fulcrum setup install core
fulcrum setup doctor core

fulcrum setup install code
fulcrum setup doctor code

fulcrum setup provider configure --kind openai-compatible --base-url http://127.0.0.1:11434/v1 --chat-model qwen3:8b --embedding-model embeddinggemma --embedding-dimensions 768
fulcrum setup install memory
fulcrum setup doctor memory
```

`setup plan` is preview only. `setup install` must mutate or verify real assets. `setup doctor` must prove functionality and print guided fixes for anything missing.

### What Fulcrum Should Install Automatically

| Area | Installed by `setup install` | Reason |
|---|---|---|
| Core | directories, config, SQLite DB, manifest/log dirs | owned local state |
| Parser assets | parser manifest and bundled parser smoke fixtures | safe and reversible |
| LanceDB | local index directory and embedded-store smoke | embedded local dependency |
| Zoekt | Fulcrum-pinned binary bundle when available; otherwise detect/guided fallback | avoids requiring Go for normal users |
| uv | detect host uv first; managed uv only with opt-in or packaged asset | avoids unexpected package-manager mutation |
| LightRAG | uv project/env under `$FULCRUM_HOME/sidecars/lightrag` once uv path exists | owned sidecar env |
| Windmill/Plane config | compose files/env under `$FULCRUM_HOME/sidecars` | config is owned; Docker runtime remains guided |

### What Doctor Should Detect And Guide

| Area | Doctor behavior |
|---|---|
| Memory provider | verify generic LLM endpoint and embedding endpoint; fail if missing |
| Ollama / LM Studio / vLLM / llama.cpp / LocalAI | offer presets, never require one product |
| Docker / Docker Desktop | detect and guide; only required for `actions` / `full` sidecars |
| Go toolchain | only required for explicit Zoekt build-from-source fallback |
| Host Python | fallback only; uv-managed Python preferred for LightRAG env |

Provider config is generic:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:11434/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "qwen3:8b"
embedding_model = "embeddinggemma"
embedding_dimensions = 768
```

Ollama is a preset that fills this shape. It is not a required dependency.

Recommended model tiers:

| Tier | Embeddings | Reranker | Chat/extraction |
|---|---|---|---|
| Normal local | `Qwen3-Embedding-0.6B` | `Qwen3-Reranker-0.6B` or `BAAI/bge-reranker-v2-m3` | `Qwen3-14B`, with `Qwen3-8B` fallback |
| High local | `Qwen3-Embedding-4B/8B` | `Qwen3-Reranker-4B` | `Qwen3-30B-A3B` or `Qwen3-32B` |
| Remote opt-in code | `Codestral Embed` or `voyage-code-3` | Cohere `rerank-v4.0-fast/pro` | `gpt-5`, `gpt-5.5` when API is available |
| Low resource | `all-minilm` or `embeddinggemma` fallback | none or `bge-reranker-v2-m3` if available | `Qwen3-8B` |

Doctor must block silent embedding drift. If an index exists with different dimensions or model, user must rebuild vectors.

Doctor output for a missing memory provider should be explicit:

```text
dependency=memory-provider status=blocked
why=LightRAG needs both LLM and embedding endpoints for extraction/query.
presets=ollama-local,lmstudio-local,vllm-local,llama-cpp-local,localai,openai-compatible
fix=fulcrum setup provider configure --kind openai-compatible --base-url <url> --chat-model <model> --embedding-model <model> --embedding-dimensions <n>
```

### Human Quick Setup Path

```bash
fulcrum init
fulcrum setup install core
fulcrum setup doctor core

fulcrum setup install code
fulcrum setup doctor code

# For memory, pick any compatible local or remote provider.
fulcrum setup provider configure --kind openai-compatible --base-url http://127.0.0.1:11434/v1 --chat-model qwen3:8b --embedding-model embeddinggemma --embedding-dimensions 768
fulcrum setup install memory
fulcrum setup doctor memory
```

### Agent Quick Setup Path

Agents should run setup in reportable, non-interactive mode:

```bash
fulcrum setup install core --json
fulcrum setup doctor core --json
fulcrum setup install code --json
fulcrum setup doctor code --json
fulcrum setup doctor memory --json
```

If `doctor memory` returns `blocked` for provider config, agents should stop and report exact missing fields instead of guessing a provider.

## Data And Ownership Model

Canonical tables/records:

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

Rule: derived state can be rebuilt; canonical state must survive backup/restore.

## Local Paths And Config

Recommended local layout:

```text
~/.fulcrum/
  config.toml
  fulcrum.db
  events/
  logs/
  backups/
  sidecars/
  indexes/
    code/
    memory/
  artifacts/
  worktrees/
```

Repo-local layout:

```text
.fulcrum/
  project.toml
  ignore
  cache/
```

Rules:

- user can override paths in config
- repo-local `.fulcrum/project.toml` stores project identity only, not secrets
- `.fulcrum/ignore` extends `.gitignore` for indexing/memory
- `fulcrum uninstall` must offer preserve backup or remove all managed state

## User Workflows

### First Run

```text
install fulcrum
fulcrum init
fulcrum up
fulcrum project add .
fulcrum task create "Add feature X"
fulcrum run start <task>
fulcrum run watch <run>
fulcrum artifact list <run>
fulcrum task done <task>
```

Acceptance:

- no cloud credentials required
- state survives daemon restart
- cockpit shows same task/run/event state
- `fulcrum doctor` reports green or actionable warnings

### Context Pack

```text
fulcrum index code .
fulcrum memory import docs/
fulcrum context build <task>
```

Acceptance:

- exact code hits shown separately from semantic hits
- memory sources include provenance
- graph links explain why items were included
- stale indexes are visible

### Worktree Delivery

```text
fulcrum worktree create <task>
fulcrum run start <task> --worktree <path>
fulcrum review open <run>
fulcrum merge queue <review>
fulcrum merge apply <merge-item>
fulcrum worktree cleanup <task>
```

Acceptance:

- dirty worktree status is visible
- artifacts attach to run
- merge conflict blocks with reason
- cleanup never deletes unmerged user work silently

## Command Contracts

### M0/M1 Required CLI Surface

| Command | Purpose | Must Return |
|---|---|---|
| `fulcrum init` | create config, DB, default workspace | created paths, workspace ID |
| `fulcrum up` | start daemon | daemon PID/socket/URL |
| `fulcrum down` | stop daemon | stopped process summary |
| `fulcrum status` | inspect daemon/profile/state | profile, DB path, daemon status, enabled capabilities |
| `fulcrum doctor` | diagnose local install | checks, severity, fix hints |
| `fulcrum project add <path>` | register repo/project | project ID, path, profile |
| `fulcrum task create <title>` | create task | task ID, project ID |
| `fulcrum run start <task>` | start supervised run | run ID, runner, stream cursor |
| `fulcrum run watch <run>` | stream run events | event stream until terminal state |
| `fulcrum artifact list <run>` | list outputs | artifact refs and paths |
| `fulcrum backup create` | backup canonical state | backup ID/path |
| `fulcrum restore verify` | validate backup readability | verification report |

### Daemon And IPC Contracts

- daemon exposes local loopback HTTP/SSE and/or Unix socket; remote bind is disabled by default.
- CLI uses daemon API when running, and can fall back to direct DB read for status/doctor only.
- Tauri frontend calls Rust commands for local state, and subscribes to event stream for live updates.
- Sidecars communicate through adapter traits and supervised process handles; sidecars never receive mutable kernel state.
- Python sidecars are isolated by process boundary, explicit config, local ports/sockets, and health checks.

### Core Lifecycle State Machine

Task states:

```text
open -> ready -> claimed -> in_progress -> review -> done
                    |             |          |
                    v             v          v
                 blocked       failed     reopened
```

Run states:

```text
queued -> starting -> running -> completing -> completed
              |          |             |
              v          v             v
           failed     blocked       failed
              |
              v
           canceled
```

Every transition writes a local event with actor, timestamp, reason, and affected refs.

## Milestones

### M0: Bootstrap And Product Skeleton

Goal: one installable local binary can initialize and report status.

Implementation paths:

- `crates/fulcrum-cli/`
- `crates/fulcrum-kernel/`
- `crates/fulcrum-daemon/`
- `crates/fulcrum-events/`
- `crates/fulcrum-config/`
- `crates/fulcrum-storage/`
- `docs/guides/local-alpha.md`

Tests:

- `crates/fulcrum-cli/tests/init.rs`
- `crates/fulcrum-daemon/tests/lifecycle.rs`
- `crates/fulcrum-storage/tests/migrations.rs`
- `tests/smoke/install_init_status.sh`

Acceptance:

- `fulcrum init` creates config and DB
- `fulcrum up` starts daemon
- `fulcrum status` shows daemon, DB, profile, paths
- `fulcrum down` stops cleanly
- `fulcrum doctor` checks paths, DB, ports, version

Implementation tasks:

- Define config schema and default paths.
- Add SQLite migration ledger and first schema.
- Implement daemon lockfile/socket/PID handling.
- Implement CLI command contracts for init/up/down/status/doctor.
- Add backup manifest format for canonical DB and events.
- Add clean install smoke fixture.

### M1: Core Task/Run/Event Loop

Goal: Fulcrum can run one supervised local action and show progress.

Implementation paths:

- `crates/fulcrum-kernel/src/tasks.rs`
- `crates/fulcrum-kernel/src/runs.rs`
- `crates/fulcrum-worker/`
- `crates/fulcrum-policy/`
- `crates/fulcrum-events/src/stream.rs`

Tests:

- `crates/fulcrum-kernel/tests/task_run_lifecycle.rs`
- `crates/fulcrum-worker/tests/subprocess_runner.rs`
- `crates/fulcrum-events/tests/replay.rs`
- `tests/e2e/first_run.sh`

Acceptance:

- create project/task
- start run with supervised subprocess/stub runner
- heartbeat visible
- cancel/complete/block states work
- artifacts attach to run
- event replay reconstructs history

Implementation tasks:

- Define task/run/action/artifact/policy schemas.
- Implement task lifecycle and run lifecycle state machines.
- Implement supervised stub/subprocess runner.
- Implement heartbeat timeout and cancellation.
- Implement artifact capture path and metadata.
- Implement SSE stream from event cursor.
- Add event replay test that reconstructs task/run history.

### M2: Owned Cockpit And TUI Alpha

Goal: operator sees live global/per-project work without Plane.

Implementation paths:

- `apps/cockpit/`
- `crates/fulcrum-desktop/`
- `crates/fulcrum-tui/`
- `crates/fulcrum-daemon/src/http.rs`

Tests:

- `apps/cockpit/tests/board.spec.ts`
- `apps/cockpit/tests/live_events.spec.ts`
- `crates/fulcrum-tui/tests/render_board.rs`
- `crates/fulcrum-daemon/tests/sse_stream.rs`

Acceptance:

- global board and per-project board render
- active runs update live
- blockers/dependencies visible
- artifacts/review/merge queues visible
- adapter/sidecar health visible
- policy decisions visible

### M3: Code Intelligence Alpha

Goal: a real repo can be indexed and queried incrementally.

Implementation paths:

- `crates/fulcrum-code-index/`
- `adapters/zoekt/`
- `adapters/lancedb/`
- `crates/fulcrum-graph/`
- `crates/fulcrum-context/`

Tests:

- `crates/fulcrum-code-index/tests/tree_sitter_symbols.rs`
- `crates/fulcrum-code-index/tests/zoekt_adapter.rs`
- `crates/fulcrum-code-index/tests/lancedb_adapter.rs`
- `crates/fulcrum-code-index/tests/incremental_file_events.rs`
- `crates/fulcrum-context/tests/code_context_pack.rs`
- `tests/e2e/index_real_repo.sh`

Acceptance:

- Tree-sitter extracts symbols/imports/chunks for supported languages
- Zoekt exact/path/regex search works or fallback is explicit
- LanceDB semantic/hybrid retrieval works or fallback is explicit
- file create/update/delete/rename updates graph and indexes
- context pack explains ranking and provenance

### M4: Markdown Memory Alpha

Goal: markdown docs and L0 memories import, update, delete, and recall with provenance.

Implementation paths:

- `crates/fulcrum-memory/`
- `sidecars/lightrag/`
- `adapters/lightrag/`
- `crates/fulcrum-context/src/memory.rs`

Tests:

- `crates/fulcrum-memory/tests/markdown_import.rs`
- `crates/fulcrum-memory/tests/lightrag_provenance.rs`
- `crates/fulcrum-memory/tests/lightrag_incremental.rs`
- `crates/fulcrum-context/tests/memory_context_pack.rs`
- `tests/e2e/memory_markdown_roundtrip.sh`

Acceptance:

- imports markdown directory
- preserves source IDs and paths
- update/delete changes recall without full rebuild
- LightRAG retrieval graph stays separate from OS graph
- RAG-Anything remains disabled/deferred

### M5: Worktree Delivery Alpha

Goal: Fulcrum manages parallel agent work safely.

Implementation paths:

- `crates/fulcrum-worktrees/`
- `crates/fulcrum-review/`
- `crates/fulcrum-merge/`
- `crates/fulcrum-artifacts/`

Tests:

- `crates/fulcrum-worktrees/tests/allocation.rs`
- `crates/fulcrum-worktrees/tests/dirty_state.rs`
- `crates/fulcrum-review/tests/review_queue.rs`
- `crates/fulcrum-merge/tests/conflict_block.rs`
- `tests/e2e/worktree_delivery.sh`

Acceptance:

- allocates branch/worktree for task
- attaches run/artifacts
- detects dirty/untracked state
- review queue opens from run
- merge queue handles success and conflict
- cleanup protects unmerged work

### M6: Sidecar Supervisor And Capability Profiles

Goal: optional products are managed, observable, and certifiable.

Implementation paths:

- `crates/fulcrum-supervisor/`
- `crates/fulcrum-profiles/`
- `adapters/plane/`
- `adapters/windmill/`
- `adapters/lightrag/`
- `adapters/zoekt/`
- `adapters/lancedb/`

Tests:

- `crates/fulcrum-supervisor/tests/process_lifecycle.rs`
- `crates/fulcrum-profiles/tests/profile_enable_disable.rs`
- `adapters/*/tests/certification.rs`
- `tests/e2e/profile_core_code_memory.sh`

Acceptance:

- enable/disable profile
- start/stop sidecars
- logs and ports visible
- failed sidecar degrades cleanly
- certification matrix produced for each adapter

### M7: Actions And Windmill Profile

Goal: human-triggered workflows/actions work without confusing agent lifecycle.

Implementation paths:

- `crates/fulcrum-actions/`
- `adapters/windmill/`
- `apps/cockpit/src/routes/actions/`

Tests:

- `crates/fulcrum-actions/tests/action_lifecycle.rs`
- `adapters/windmill/tests/job_mapping.rs`
- `apps/cockpit/tests/actions.spec.ts`
- `tests/e2e/windmill_action_profile.sh`

Acceptance:

- launch action from CLI/cockpit
- map Windmill job ID to Fulcrum action
- stream action status/logs
- attach result to task/run/artifact
- agent run lifecycle remains Fulcrum-owned

### M8: Plane Adapter Beta

Goal: Plane is optional PM surface, not required core.

Implementation paths:

- `adapters/plane/`
- `apps/cockpit/src/routes/integrations/plane/`
- `crates/fulcrum-sync/`

Tests:

- `adapters/plane/tests/id_mapping.rs`
- `adapters/plane/tests/webhook_ingest.rs`
- `adapters/plane/tests/read_write_sync.rs`
- `tests/e2e/plane_optional_adapter.sh`

Acceptance:

- maps Plane work item to Fulcrum task
- webhooks create Fulcrum events
- sync is optional and reversible
- Plane outage does not break core/cockpit
- local footprint documented

### M9: Packaging, Privacy, And Release Candidate

Goal: ready for real user install.

Implementation paths:

- `scripts/release/`
- `.github/workflows/release.yml`
- `docs/guides/install.md`
- `docs/guides/privacy.md`
- `docs/guides/troubleshooting.md`
- `docs/guides/uninstall.md`

Tests:

- `tests/smoke/clean_machine_linux.sh`
- `tests/smoke/clean_machine_macos.sh`
- `tests/e2e/backup_restore.sh`
- `tests/e2e/uninstall.sh`
- `tests/security/no_remote_default.sh`

Acceptance:

- release artifacts install cleanly
- no remote network calls by default except explicit user-requested downloads
- backup/restore works
- uninstall removes managed state/processes or preserves backup by choice
- docs cover profiles, paths, privacy, and troubleshooting

Packaging flow:

- CI builds release artifacts for Linux and macOS.
- Release artifact includes CLI, daemon, cockpit assets, default config template, and license notices.
- First launch creates local state; no post-install daemon starts without explicit `fulcrum up`.
- Upgrade runs migrations after backup.
- Rollback instructions are documented.

## Adapter Certification Matrix

Every adapter must report:

| Gate | Plane | Windmill | LightRAG | Zoekt | LanceDB |
|---|---|---|---|---|---|
| install command | required | required | required | required | required |
| local health | required | required | required | required | required |
| external ID mapping | required | required | required | required | required |
| CRUD/read-write contract | required | required | import/query/update/delete | index/query/update/delete | upsert/query/delete |
| offline behavior | required | required | required | required | required |
| provenance | events/webhooks | job/action refs | source IDs | file refs | chunk refs |
| backup/restore | required for mapping/sync state | required for action/job mapping state | required | rebuildable from file/index state | rebuildable from chunk/index state |
| Fulcrum ref mapping | work item -> task | job -> action/run | source -> memory | file/index -> code ref | chunk -> code ref |
| footprint | measured | measured | measured | measured | measured |
| profile | optional beta | actions | memory | code | code |

No adapter moves from experimental to profile default until its certification test passes in CI and clean-machine smoke.

## Security And Privacy Plan

Defaults:

- local-only operation
- loopback bind for daemon/cockpit
- no remote model/provider/export/sync without explicit opt-in
- `.gitignore` plus `.fulcrum/ignore` respected
- secrets excluded from code/memory indexes by default
- logs redact common token formats
- artifacts can be purged per run/task/project

Implementation units:

- secret scanner in `crates/fulcrum-policy/`
- ignore matcher in `crates/fulcrum-indexing/`
- redaction utility in `crates/fulcrum-redaction/`
- privacy tests in `tests/security/`

Threat model:

- accidental remote data exfiltration through model providers, telemetry exporters, sync adapters, or sidecars
- accidental indexing of secrets or private generated files
- local HTTP surface exposed beyond loopback
- logs/artifacts retaining sensitive content after reset/uninstall
- sidecar process continuing after Fulcrum shutdown

Security gates:

- network-deny test proves core/first-run sends no remote requests
- secret fixture test proves common tokens are excluded/redacted
- ignore fixture test proves `.gitignore` and `.fulcrum/ignore` are respected
- bind test proves daemon/cockpit bind loopback by default
- purge test proves run artifacts/logs can be removed
- opt-in test proves remote providers require explicit config and visible status

## Clean-Machine Validation Script

The release candidate must pass:

```text
install artifact
fulcrum init
fulcrum up
fulcrum doctor
fulcrum project add sample-repo
fulcrum task create "Smoke task"
fulcrum run start <task> --runner stub
fulcrum run watch <run>
fulcrum cockpit smoke
fulcrum artifact list <run>
fulcrum index code sample-repo
fulcrum memory import sample-repo/docs
fulcrum context build <task>
fulcrum worktree create <task>
fulcrum review open <run>
fulcrum merge queue <review>
fulcrum profile enable code
fulcrum profile disable code
fulcrum policy smoke
fulcrum backup create
fulcrum down
fulcrum up
fulcrum restore verify
fulcrum backup restore <backup>
fulcrum doctor
fulcrum uninstall --preserve-backup
```

## Traceability

| Requirement | Milestones |
|---|---|
| R1-R5 install/runtime/durability | M0, M6, M9 |
| R6-R9 core OS/persistence/policy | M0, M1, M9 |
| R10-R13 daily workflow/cockpit | M1, M2, M8 |
| R14-R17 agent/worktree delivery | M1, M5 |
| R18-R23 context/code/memory/graph | M3, M4 |
| R24-R28 profiles/adapters | M6, M7, M8 |
| R29-R33 security/privacy | M0, M3, M4, M9 |
| R34-R37 release quality | all milestones, M9 gate |

## What Current Spike Covers

Current spike helps but does not ship:

- `crates/fulcrum-kernel`: early canonical state and adapter mapping shape
- `crates/fulcrum-events`: event store sketch
- `crates/fulcrum-code-index`: in-memory contract sketch
- `crates/fulcrum-memory`: markdown/L0 provenance sketch
- `crates/fulcrum-desktop` and `apps/cockpit`: snapshot/UI shell sketch

These should be treated as disposable reference code unless they accelerate the real milestone implementation.

## Definition Of Done

### Local Alpha

- M0-M2 complete
- first-run workflow works end-to-end
- state persists
- cockpit/TUI show live runs
- backup/restore works for core state
- no external product required

### Useful Alpha

- M0-M5 complete
- code index and markdown memory work
- context packs explain sources
- worktree delivery loop works

### Beta

- M0-M8 complete
- optional Windmill and Plane profiles certified
- LightRAG/Zoekt/LanceDB real adapters certified or fallbacks explicitly shipped

### Release Candidate

- M0-M9 complete
- clean-machine validation passes
- privacy/security defaults verified
- uninstall/reset verified
- docs complete

## Immediate Next Work

1. Stop calling the spike product-ready.
2. Start M0 with config, SQLite WAL migration ledger, CLI command contracts, daemon lifecycle, and smoke tests.
3. Build `fulcrum init/up/status/doctor/down`.
4. Add clean-machine smoke script.
5. Start M1 with task/run schemas and supervised stub/subprocess runner.
6. Only then deepen code/memory/product integrations.
