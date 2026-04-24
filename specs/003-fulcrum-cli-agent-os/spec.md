# Feature Specification: Fulcrum CLI Agent OS

**Feature Branch**: `[specs/003-fulcrum-cli-agent-os]`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Create a Spec Kit feature specification for the full Fulcrum CLI Agent OS roadmap using the 2026-04-24 roadmap, model, local-first stack, cross-OS setup, scope, system design, full delivery plan, and roadmap input documents."

## Clarifications

### Session 2026-04-24

- Q: Should setup install be a preview or a real executor? -> A: `plan` previews; `install` mutates only selected managed assets and writes receipts.
- Q: What machine-readable format should setup install expose for agents? -> A: `setup install --json` emits JSONL step events.
- Q: Which live event transport should CLI watch and cockpit use? -> A: SSE/live streams with cursor-based reconnect.
- Q: How should semantic vector backlog jobs be constrained? -> A: Daemon-drained jobs with bounded batches, one active slice per workspace/project/source domain, cancellation after current batch, and resumable manual recovery.
- Q: How should context budgets and query latency be made testable? -> A: Tokenizer-aware budgets with deterministic fallback, optional provider tokenizer plugins, and traced query embedding cache/cold-start latency.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bootstrap A Local Agent OS (Priority: P1)

As an individual developer/operator, I need Fulcrum to initialize, run, stop, recover, report health, and preserve local state on a normal workstation so that I can trust it as my daily local agent operating system.

**Why this priority**: Every later capability depends on a reliable local kernel, daemon, event store, setup flow, and recoverable canonical state.

**Independent Test**: Can be tested on a clean machine by installing Fulcrum, initializing a workspace, starting and stopping the daemon, creating a task and run, restarting, and verifying state, health, backup, restore, and uninstall behavior.

**Acceptance Scenarios**:

1. **Given** a clean supported workstation with no cloud credentials, **When** the operator initializes Fulcrum and starts the daemon, **Then** Fulcrum creates local state only after explicit command, binds locally, reports health, and requires no remote service.
2. **Given** existing local state, **When** Fulcrum restarts after a daemon stop or process failure, **Then** tasks, runs, events, artifacts, policies, graph refs, and setup receipts remain inspectable and recoverable.
3. **Given** an operator requests backup, restore, export, import, reset, rebuild-index, or uninstall, **When** the command is previewed or executed, **Then** scope, preserved backups, destructive effects, and recovery path are explicit before mutation.
4. **Given** default `core` profile only, **When** optional code, memory, actions, or PM adapters are absent, **Then** core CLI, daemon, state, health, and cockpit model still operate with explicit optional/degraded statuses.

---

### User Story 2 - Prove Setup Profiles And Doctor Readiness (Priority: P1)

As an operator or agent, I need setup profiles that can be planned, installed, diagnosed, repaired, and uninstalled with exact readiness states so that machine setup is deterministic instead of guesswork.

**Why this priority**: The roadmap treats `doctor` as the readiness authority and requires clean-machine setup before any product claim.

**Independent Test**: Can be tested by running profile setup on an isolated home directory and confirming plan output is read-only, install mutates only managed assets, doctor performs real smoke checks, JSON output is machine-readable, and blocked states include exact fixes.

**Acceptance Scenarios**:

1. **Given** an operator selects `core`, `code`, `memory`, `actions`, or `full`, **When** setup plan runs, **Then** Fulcrum reports required, optional, managed, detected, guided, and blocked dependencies without changing local state.
2. **Given** setup install runs for a selected profile, **When** installation completes, **Then** only safe Fulcrum-managed assets and receipts for that profile are created under the Fulcrum home.
3. **Given** a required dependency, provider, model, sidecar, or profile artifact is missing, **When** doctor runs, **Then** the profile is blocked with exact remediation, and agent JSON mode contains enough structured data to stop safely.
4. **Given** offline, no-model-download, or host-tools-only mode is selected, **When** setup runs, **Then** Fulcrum avoids disallowed network or download behavior and reports whether existing cache or host tools satisfy the profile.

---

### User Story 3 - Operate Tasks, Runs, Cockpit, And Live State (Priority: P1)

As an operator, I need one owned cockpit/TUI and CLI view of tasks, runs, blockers, artifacts, queues, policy decisions, sidecar health, and live agent activity so that I can supervise work without relying on an external PM product.

**Why this priority**: Fulcrum's core value is the local operating layer; external PM products are optional adapters, not the source of truth.

**Independent Test**: Can be tested by creating tasks and supervised runs, streaming events, changing run states, attaching artifacts, and confirming CLI and cockpit show the same global and per-project state without refresh.

**Acceptance Scenarios**:

1. **Given** a task and agent run are created, **When** the run starts, heartbeats, blocks, fails, cancels, or completes, **Then** CLI, TUI/cockpit, event replay, and health surfaces reflect one valid lifecycle state.
2. **Given** global and per-project boards are open, **When** task, blocker, dependency, review, merge, artifact, or policy events occur, **Then** both views update from the same canonical data.
3. **Given** a run produces artifacts or handoffs, **When** the operator inspects the run, **Then** artifact identity, kind, size, digest, producer refs, related task, and file/review links are visible.
4. **Given** an adapter or sidecar is missing, unhealthy, or optional, **When** cockpit health is viewed, **Then** the capability impact is visible without preventing unrelated core workflows.

---

### User Story 4 - Build Explainable Code Intelligence (Priority: P1)

As a developer or agent, I need code intelligence that combines exact search, paths, symbols, structure, semantic behavior, dependencies, and graph refs so that context packs can answer implementation questions with cited evidence.

**Why this priority**: Useful Alpha requires real project code indexing and explainable context; generic source-file search is insufficient for agent work.

**Independent Test**: Can be tested by indexing a real repository, creating/updating/deleting/renaming files, searching exact identifiers and natural-language implementation questions, and verifying ranked results, citations, stale-state handling, and graph updates.

**Acceptance Scenarios**:

1. **Given** a real project is indexed, **When** a developer searches for an identifier, file path, quoted phrase, error string, dependency, symbol suffix, or natural-language behavior, **Then** results identify the evidence lane and rank exact structured matches ahead of weak semantic matches.
2. **Given** a file is created, changed, deleted, or renamed, **When** indexing runs, **Then** file, symbol, chunk, semantic, lexical, and graph refs update incrementally without requiring a full rebuild for normal correctness.
3. **Given** semantic vectors or optional search backends are unavailable, **When** code search runs, **Then** exact and structural search still works and degraded lanes are reported explicitly.
4. **Given** context is packed for an agent, **When** code evidence is included, **Then** each item has stable source refs, file path, line range, symbol context, freshness, lane contribution, and provenance.

---

### User Story 5 - Import Markdown Memory And Retrieve Graph Context (Priority: P1)

As a developer/operator, I need markdown and L0/L1 memory import with provenance, model/provider readiness, update/delete behavior, graph-enhanced retrieval, and explainable context packs so that agents can use durable project knowledge safely.

**Why this priority**: The roadmap's default development target includes markdown memory import, and memory quality depends on provider readiness, provenance, graph links, and rebuildable derived indexes.

**Independent Test**: Can be tested by configuring a local provider, importing markdown and L0 sources, updating and deleting sources, querying memory/context, and confirming cited provenance, graph refs, dimension locks, and degraded-mode reporting.

**Acceptance Scenarios**:

1. **Given** memory profile is requested without a configured provider, **When** doctor runs, **Then** memory readiness is blocked with exact provider preset/configuration guidance while core remains usable.
2. **Given** markdown or L0 memory sources are imported, updated, deleted, or tombstoned, **When** memory query runs, **Then** recall changes reflect source state and preserve source IDs, provenance, and graph linkability.
3. **Given** embedding model or dimensions changed after indexing, **When** doctor, query, or indexing runs, **Then** Fulcrum blocks silent drift and requires affected vector rebuild before declaring memory healthy.
4. **Given** a context pack uses memory and graph evidence, **When** explanation is requested, **Then** memory, code, task, run, artifact, policy, and graph contributions are distinguishable and cited.

---

### User Story 6 - Deliver Work Through Worktrees And Reviews (Priority: P2)

As an operator, I need Fulcrum to allocate task worktrees, supervise agent runs, collect artifacts, drive review and merge queues, and block unsafe cleanup or merges so that local agent work can move from task to delivery.

**Why this priority**: Worktree delivery turns Fulcrum from observability into a usable agent delivery system.

**Independent Test**: Can be tested by allocating a worktree for a task, running an agent, producing artifacts, reviewing changes, merging or hitting a conflict, and verifying task/run/graph state updates.

**Acceptance Scenarios**:

1. **Given** a task is ready for delivery, **When** a run starts, **Then** Fulcrum allocates a branch/worktree relation, records it, and shows dirty/untracked status.
2. **Given** a run produces code or review artifacts, **When** the operator reviews the work, **Then** findings attach to artifacts, files, runs, and tasks.
3. **Given** a merge succeeds, **When** delivery completes, **Then** task/run state, artifacts, graph refs, and merge queue status update together.
4. **Given** conflicts, dirty state, unmerged work, or unsafe cleanup conditions exist, **When** cleanup or merge is requested, **Then** Fulcrum blocks with explicit reason and preserves user work.

---

### User Story 7 - Certify Optional Actions And PM Adapters (Priority: P2)

As an operator, I need optional action and PM adapters to be installable, diagnosable, reversible, and clearly bounded so that Fulcrum can extend workflows without letting sidecars own canonical state.

**Why this priority**: Windmill and Plane are roadmap adapters, but core value and source of truth must remain Fulcrum-owned.

**Independent Test**: Can be tested by enabling optional profiles, launching an action smoke run, importing/exporting PM items, simulating outage/conflict/offline boot, and confirming Fulcrum canonical state remains intact.

**Acceptance Scenarios**:

1. **Given** actions profile is enabled, **When** an operator launches an action, **Then** Fulcrum creates the action record, applies policy before launch, maps external job status, and attaches logs/results as artifacts.
2. **Given** Windmill or Docker is absent, **When** core, code, or memory workflows run, **Then** they continue unaffected and actions readiness is guided or blocked only for selected profiles.
3. **Given** an optional Plane adapter imports, exports, syncs, or receives webhooks, **When** conflicts or outage occur, **Then** Fulcrum represents conflicts explicitly and continues to own task/run identity.
4. **Given** an adapter is proposed as default or profile-supported, **When** certification is reviewed, **Then** install strategy, health checks, ID mapping, CRUD/update/delete semantics, provenance, offline behavior, backup/restore, uninstall, footprint, and privacy notes are documented and tested.

---

### User Story 8 - Gate Release Quality, Privacy, And Roadmap Progress (Priority: P2)

As a maintainer, I need milestone gates, validations, security checks, observability, and release bands so that Fulcrum can progress from alpha to beta to release candidate without overclaiming readiness.

**Why this priority**: The roadmap explicitly frames the current branch as alpha/spike foundation and requires validation gates before product readiness.

**Independent Test**: Can be tested by running milestone validations for Local Alpha, Useful Alpha, Adapter Beta, and Release Candidate and confirming each gate produces pass/fail evidence, residual risks, and no hidden network or secret leakage.

**Acceptance Scenarios**:

1. **Given** a milestone or release band is claimed, **When** validation runs, **Then** every required capability for that band has concrete pass/fail evidence and missing optional capabilities are explicitly deferred or degraded.
2. **Given** first-run, indexing, retrieval, traces, logs, artifacts, backup, restore, or uninstall are exercised, **When** privacy gates run, **Then** local-only defaults, loopback binding, secret redaction, ignore rules, purge behavior, and remote opt-in warnings are verified.
3. **Given** code, memory, graph, setup, model/provider, or adapter changes land, **When** quality gates run, **Then** affected smoke, eval, health, and certification checks run or fail with explicit skipped/degraded reasons.
4. **Given** telemetry/export/integration features are enabled, **When** they operate, **Then** local events remain primary, external export stays opt-in, and logs can be redacted or purged.

### Edge Cases

- User starts with no cloud credentials, no remote model, no Docker, and no optional sidecars.
- Existing Fulcrum home contains partial receipts, stale lockfile entries, or failed previous setup steps.
- Network is unavailable or explicitly denied during first run, setup, doctor, import, query, validation, backup, restore, or uninstall.
- Host dependency exists but incompatible version, architecture, path, permissions, or health check result.
- Download cache contains corrupt, unpinned, missing-hash, partial, or mismatched artifacts.
- Provider endpoint exists but chat, embedding, rerank, model list, privacy status, or embedding dimensions do not match configuration.
- Model/provider is changed after vectors exist.
- Optional remote provider is configured without visible opt-in or privacy status.
- Workstation has limited memory/CPU and cannot run recommended local models or optional sidecars.
- Windows path, executable suffix, shell behavior, Docker Desktop, or packaging constraints differ from Linux/macOS.
- Daemon stops while a setup, index, memory import, action, worktree, query, or repair job is in progress.
- Multiple agents write events, heartbeats, artifacts, or run transitions concurrently.
- Run attempts invalid state transition or multiple terminal states.
- Event stream disconnects, reconnects, or replays from an old cursor.
- Code file is binary, too large, ignored, moved, deleted, renamed, unparsable, or changed during indexing.
- Search result could expose secrets, private paths beyond the operator surface, or ignored files.
- Memory source is duplicated, deleted, renamed, tombstoned, or lacks clear provenance.
- Graph refs become stale after task, memory, code, artifact, or policy changes.
- Context pack is dominated by one file, memory family, source type, or stale evidence.
- Worktree has dirty, untracked, conflicted, unmerged, or user-owned changes during merge/cleanup.
- Adapter sidecar is absent, unhealthy, too heavy, offline, or has conflicting external IDs.
- Backup or restore encounters newer schema, partial files, missing artifacts, or paths outside Fulcrum home.
- Uninstall is requested with backup purge or destructive reset scope.

### Scope Boundaries

- This feature defines the product roadmap and acceptance specification for Fulcrum CLI Agent OS; it does not implement the roadmap.
- Fulcrum is local-first for individual developers/operators, not a cloud/team-server product.
- Fulcrum owns canonical local state for workspaces, projects, tasks, runs, events, policies, artifacts, context refs, graph refs, adapters, setup receipts, and memory source refs.
- External products are adapters or sidecars only; they must not directly mutate canonical Fulcrum state.
- Default install is `core`; `code`, `memory`, `actions`, `full`, remote providers, external sync, telemetry export, Windmill, and Plane are opt-in or profile-gated.
- Plane is optional import/export/sync or PM surface validation; the owned cockpit/TUI remains required.
- Windmill is optional human-triggered action orchestration; Fulcrum retains agent lifecycle, task claiming, heartbeats, policy, and live event stream.
- LightRAG retrieval graph is separate from Fulcrum OS graph; Fulcrum owns provenance and cross-domain refs.
- Code intelligence is distinct from memory RAG and must preserve exact, structural, semantic, and graph-aware retrieval lanes.
- PDF/Office ingestion, marketplace/plugin packaging, enterprise multi-user permissions, hosted cloud service, Kubernetes, remote database, and team-server workflows are out of scope for this roadmap feature.
- Current implementation work is treated as alpha/spike foundation until the milestones and gates in this spec pass.

### Terminology

- **Fulcrum home**: Local directory where managed state, receipts, indexes, logs, backups, manifests, and sidecar assets live; Linux/macOS default to `$HOME/.fulcrum`, while Windows remains `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` until packaging finalization.
- **Canonical state**: Fulcrum-owned records that must survive backup/restore and must not be owned by adapters.
- **Derived state**: Rebuildable indexes, vectors, graph extraction outputs, rankings, and transient traces derived from canonical sources.
- **Profile**: Capability bundle selected by an operator: `core`, `code`, `memory`, `actions`, or `full`.
- **Doctor**: Readiness authority that checks receipts, dependencies, providers, sidecars, smoke tests, privacy status, and exact remediation.
- **Cockpit/TUI**: Owned local operator interface showing canonical task, run, event, queue, health, policy, artifact, adapter, and live activity state.
- **OS graph**: Fulcrum-owned cross-domain graph linking memory, code, tasks, runs, artifacts, policies, actions, context packs, and adapters.
- **Context pack**: Source-diverse cited evidence assembled for an agent or operator from code, memory, graph, task, run, artifact, and policy sources.
- **Adapter certification**: Evidence that an optional product can be installed, diagnosed, mapped, degraded, backed up, restored, uninstalled, and kept within Fulcrum ownership boundaries.
- **Release band**: Roadmap readiness level: Local Alpha, Useful Alpha, Adapter Beta, Release Candidate, or Beta Hardening.

## Requirements *(mandatory)*

### Functional Requirements

#### Core Kernel, State, And Recovery

- **FR-001**: Fulcrum MUST provide local initialization, daemon start, daemon stop, status, doctor, validation, backup, restore, export, import, rebuild-index, reset, and uninstall surfaces.
- **FR-002**: Fulcrum MUST create local state only after explicit operator command and MUST NOT require cloud credentials, remote database, remote telemetry, Kubernetes, Docker, or remote model provider for `core`.
- **FR-003**: Fulcrum MUST persist canonical workspace, project, task, dependency, run, heartbeat, action, artifact, review, merge, policy, event, graph ref, adapter ref, external mapping, sidecar, index state, memory source, and context pack records across restart and backup/restore.
- **FR-004**: Fulcrum MUST distinguish canonical state from derived state and MUST permit derived indexes and graph/retrieval outputs to be repaired or rebuilt without deleting canonical records.
- **FR-005**: Fulcrum MUST provide migration, backup, restore verification, rollback documentation, and crash recovery evidence before Release Candidate.
- **FR-006**: Fulcrum MUST preview destructive, scoped, or backup-affecting operations before mutation and MUST preserve backups by default during uninstall.
- **FR-007**: Fulcrum MUST report health for local database, event replay, daemon lifecycle, sidecars, adapters, setup profile, indexes, graph refs, and privacy posture.
- **FR-008**: Fulcrum MUST provide machine-readable output for agent-facing setup, health, validation, task/run, artifact, context, and adapter operations; `setup install --json` MUST emit JSONL step events for setup start, completion, failure, paths, and duration.

#### Setup Profiles And Doctor

- **FR-009**: Fulcrum MUST support `core`, `code`, `memory`, `actions`, and `full` profiles with `core` as the default install.
- **FR-010**: Fulcrum MUST provide read-only setup planning, bounded setup installation, readiness doctor, provider configuration, repair, uninstall, logs, and validation workflows for selected profiles.
- **FR-011**: Setup install MUST mutate only selected safe Fulcrum-managed assets (`config.toml`, `fulcrum.db`, `events/`, `logs/`, `backups/`, `manifests/`, `bin/`, `parsers/`, `indexes/`, `sidecars/lightrag/`, and generated compose/env files for selected optional Docker profiles) and MUST create receipts for managed artifacts.
- **FR-012**: Setup doctor MUST classify each dependency as `managed`, `detected`, `guided`, `optional`, or `blocked`.
- **FR-013**: Setup doctor MUST be the readiness authority and MUST run real smoke checks for selected profile capabilities rather than relying only on planned state.
- **FR-014**: Setup lock and receipts MUST record selected profile, host OS/architecture, dependency versions, source identity, checksums where applicable, installed paths, health command/result, and managed/detected/guided status.
- **FR-015**: Setup MUST support offline, no-model-download, and host-tools-only modes with explicit pass, blocked, or guided outcomes.
- **FR-016**: Setup downloads MUST use pinned sources, checksum verification, temporary files, atomic finalization, retry-safe behavior, and source/hash logging.
- **FR-017**: Setup MUST avoid host package manager mutation, privileged global binary paths, Docker requirements, and model downloads unless explicitly selected or guided.
- **FR-018**: Setup and doctor MUST provide cross-OS behavior and documentation for supported Linux, macOS, and Windows targets, including Linux/macOS `$HOME/.fulcrum`, Windows `%USERPROFILE%\.fulcrum` or `%LOCALAPPDATA%\Fulcrum` until packaging finalization, Windows `.exe` wrapper constraints, and avoidance of shell-only scripts.

#### Model And Provider Readiness

- **FR-019**: Fulcrum MUST expose a provider-neutral model configuration contract for chat/extraction, embedding, optional reranking, model names, dimensions, privacy status, and provider kind.
- **FR-020**: Fulcrum MUST present Ollama, LM Studio, vLLM, llama.cpp server, LocalAI, and generic OpenAI-compatible endpoints as presets or compatible providers without requiring any one of them by default.
- **FR-021**: Fulcrum MUST recommend local-first model tiers and MUST make remote providers explicit opt-in with visible privacy/cost/status warnings.
- **FR-022**: Doctor MUST verify chat and embedding endpoint health, configured embedding dimensions, optional reranker health, and existing vector index compatibility.
- **FR-023**: Fulcrum MUST block silent embedding model or dimension drift and require affected vector rebuild before declaring relevant indexes healthy.
- **FR-024**: Fulcrum MUST NOT auto-download large model weights without explicit operator consent.

#### Task, Run, Event, Cockpit, And Observability

- **FR-025**: Fulcrum MUST own task lifecycle, run lifecycle, action records, policy decisions, artifact capture, event append/replay, heartbeats, cancellation, blocking, failure, completion, and terminal transition validation.
- **FR-026**: Fulcrum MUST reject invalid state transitions and MUST ensure each run reaches at most one terminal state.
- **FR-027**: Fulcrum MUST provide supervised stub and subprocess run modes before depending on external action products.
- **FR-028**: Fulcrum MUST stream live run and system events through SSE/live streams with cursor-based reconnect/replay semantics sufficient for CLI watch and cockpit/TUI live views.
- **FR-029**: Cockpit/TUI and CLI MUST show the same canonical state for global boards, per-project boards, active runs, blockers, dependencies, task queues, review queues, merge queues, artifacts, policy decisions, adapter health, and sidecar health.
- **FR-030**: Event replay MUST be able to reconstruct dashboard and run state for validation and recovery.
- **FR-031**: Fulcrum MUST store local events first and keep external telemetry export optional and opt-in.
- **FR-032**: Fulcrum MUST support log, trace, event, and artifact redaction and purge workflows.

#### Code Intelligence And Context

- **FR-033**: Fulcrum MUST provide code indexing and search over real projects using exact identifier, path, filename, phrase, regex/string, symbol/structure, dependency, recency, semantic, and graph evidence lanes.
- **FR-034**: Code search MUST rank exact symbol, exact token, file path, quoted phrase, identifier-like, and suffix matches ahead of weak semantic matches when query intent is identifier-like.
- **FR-035**: Code indexing MUST update file, symbol, import, chunk, lexical, semantic, and graph state on create, update, delete, and rename without requiring full rebuild for normal correctness.
- **FR-036**: Code search MUST expose lane contribution, rank, score or order rationale, freshness, source diversity, and degraded/skipped lane reasons.
- **FR-037**: Code evidence in context packs MUST include stable file identity, file path, line range, symbol context when available, content freshness, and provenance.
- **FR-038**: Code semantic backlog and vector jobs MUST be daemon-drained, bounded, resumable, observable, cancellable after the current batch, separated from cheap watcher/indexer event paths, and limited to one active slice per workspace/project/source domain.
- **FR-039**: Code profile doctor MUST prove parser readiness, lexical index readiness, semantic store readiness or explicit fallback, fixture index/query behavior, and durable indexed row counts.
- **FR-040**: Code indexing and search MUST respect ignore rules, binary/large-file skips, secret exclusion, and privacy gates.

#### Memory, RAG, And OS Graph

- **FR-041**: Fulcrum MUST support markdown and L0/L1 memory source import, update, delete, tombstone, query, provenance, and graph linkability.
- **FR-042**: Memory profile readiness MUST require configured provider health before memory is considered ready, while absence of memory provider MUST NOT block `core`.
- **FR-043**: Memory retrieval MUST preserve source IDs, citations, provenance class, freshness, and update/delete effects in query results and context packs.
- **FR-044**: Fulcrum MUST maintain an OS graph linking memory, code, tasks, plans, runs, actions, artifacts, policies, context packs, files, symbols, chunks, imports, and external refs.
- **FR-045**: Fulcrum OS graph MUST remain distinct from retrieval-specific graphs and MUST own cross-domain stable refs.
- **FR-046**: Graph refs MUST update incrementally on normal task, run, artifact, memory, code, delete, rename, and policy changes; full rebuild MUST be repair, not the normal correctness mechanism.
- **FR-047**: Context retrieval MUST combine memory, code, file, graph, task, run, artifact, and policy evidence into source-diverse context packs with explanation.
- **FR-048**: Context packing MUST prevent one file, memory family, source, or evidence lane from dominating packed context unless explicitly targeted.
- **FR-049**: RAG and context quality gates MUST test groundedness, cited source spans, adversarial wrong context, graph contribution, tokenizer-aware budgets with deterministic fallback and optional provider tokenizer plugins, cold-start/query-embedding latency with cache-hit trace fields, and degraded lane reporting.
- **FR-050**: Query traces and persisted context artifacts MUST be read-only by default unless persistence is explicitly requested.

#### Worktree Delivery

- **FR-051**: Fulcrum MUST provide task-to-worktree delivery workflows covering branch/worktree allocation, run relation, artifacts, review queue, merge queue, merge success, merge conflict, blocked state, and cleanup.
- **FR-052**: Worktree status MUST expose dirty, untracked, conflicted, unmerged, or unsafe cleanup state.
- **FR-053**: Review findings MUST attach to artifacts, files, tasks, and runs.
- **FR-054**: Merge success or conflict MUST update task, run, artifact, merge queue, review queue, and graph state consistently.
- **FR-055**: Cleanup MUST refuse unsafe deletion of dirty, unmerged, or user-owned worktrees.

#### Optional Adapters And Sidecars

- **FR-056**: Optional action workflow support MUST keep Fulcrum as owner of task claiming, agent run lifecycle, heartbeats, policy, event stream, and action/task/run ID mapping.
- **FR-057**: Windmill or equivalent action adapter MUST be optional, profile-gated, guided when dependencies are missing, and unable to mutate agent run lifecycle directly.
- **FR-058**: Action launch MUST create a Fulcrum action record, pass policy before launch, map external status, and attach logs/results as artifacts.
- **FR-059**: Optional Plane or PM adapter support MUST keep Fulcrum cockpit and canonical task/run identity usable when the adapter is absent or offline.
- **FR-060**: PM adapter import/export/sync MUST represent conflicts explicitly and provide reversible mapping to Fulcrum refs.
- **FR-061**: Every optional adapter MUST pass certification covering install strategy, doctor health, profile requirement, local footprint, ports/processes, external IDs, mapping, CRUD/update/delete semantics, provenance, offline and offline-boot behavior, backup/restore, uninstall, degraded mode, security/privacy, and clean-machine smoke results.
- **FR-062**: No optional adapter MUST become default unless certification and release-band gates pass.

#### Security, Privacy, Validation, And Release Roadmap

- **FR-063**: Fulcrum MUST default to local-only operation, loopback binding, no remote provider, no remote telemetry, no external sync, and no hidden network calls in `core`.
- **FR-064**: Remote providers, telemetry export, external sync, Docker sidecars, and large downloads MUST require explicit opt-in or selected profile flow.
- **FR-065**: Fulcrum MUST redact secrets, credentials, raw environment values, unapproved private paths, and provider secrets from logs, traces, artifacts, evals, reports, memory, and context packs.
- **FR-066**: Fulcrum MUST respect project ignore rules and Fulcrum-specific ignore rules for indexing, retrieval, memory import, and artifact handling.
- **FR-067**: Fulcrum MUST provide validation scopes for core, code, memory, actions, full, release, privacy, setup, graph, context, and adapter certification.
- **FR-068**: Release bands MUST define measurable gates for Local Alpha, Useful Alpha, Adapter Beta, Release Candidate, and Beta Hardening.
- **FR-069**: The roadmap MUST treat M0-M2 as Local Alpha, M0-M6 as Useful Alpha because setup profiles are required before useful code/memory claims, M0-M8 as Adapter Beta, and M0-M12 as Release Candidate/Beta Hardening.
- **FR-070**: Fulcrum MUST expose open design decisions as milestone-bound assumptions or certification gates rather than blocking this specification.

### Key Entities *(include if feature involves data)*

- **Workspace**: Local scope containing projects, tasks, runs, events, memory, code indexes, graph refs, and adapter mappings.
- **Project**: Work unit within a workspace with code roots, tasks, memory links, runs, worktrees, and indexes.
- **Task**: Fulcrum-owned unit of planned or active work with dependencies, blockers, assignees/agents, artifacts, context, and lifecycle state.
- **Run**: Supervised execution attempt for a task with heartbeat, terminal state, policy checks, events, artifacts, and optional worktree relation.
- **Event**: Append-only local record describing changes to tasks, runs, actions, artifacts, policies, indexes, graph refs, setup, sidecars, and health.
- **Artifact**: Output from a run, action, review, merge, or validation with identity, path/ref, kind, size, digest, producer refs, and retention/purge status.
- **Policy Decision**: Local record authorizing, blocking, or constraining a run, action, adapter operation, destructive operation, or remote/sidecar use.
- **Setup Profile**: Selected capability bundle: `core`, `code`, `memory`, `actions`, or `full`.
- **Setup Lock**: Manifest of selected profile, host platform, dependencies, sources, versions, checksums, installed paths, and health results.
- **Setup Receipt**: Per-step proof that a managed setup asset was installed, detected, repaired, or uninstalled.
- **Dependency Status**: Readiness state: `managed`, `detected`, `guided`, `optional`, or `blocked`.
- **Provider Configuration**: Provider-neutral local or remote model configuration with endpoint, model names, dimensions, API-key reference, privacy status, and health results.
- **Index File State**: Canonical record of source file identity, classification, ignore/skip status, parse/index/vector state, freshness, and errors.
- **Code Evidence Unit**: Searchable file, symbol, import, chunk, dependency, lexical hit, semantic hit, or graph-linked code result with source refs.
- **Memory Source**: Markdown, L0, L1, curated, or imported source with stable ID, provenance, freshness, and tombstone/update state.
- **Graph Node/Edge**: Fulcrum-owned cross-domain relationship between memory, code, tasks, runs, artifacts, actions, policies, and context packs.
- **Context Pack**: Source-diverse cited evidence bundle assembled for an agent/operator with lane contributions and token/budget metadata.
- **Query Trace**: Explain record for context retrieval with candidate counts, rankings, lane use, degraded states, runtime truth, latency, and provenance.
- **Worktree Allocation**: Relationship between task/run, branch/worktree path, status, dirty state, artifacts, review, merge, and cleanup safety.
- **Action Record**: Fulcrum-owned record for an optional external or local action with policy, status mapping, logs, results, and artifacts.
- **Adapter Mapping**: Reversible mapping between Fulcrum refs and external product IDs, conflicts, health, and sync/import/export state.
- **Adapter Certification Report**: Evidence package proving optional adapter install, doctor, mappings, CRUD/update/delete, offline behavior, backup/restore, uninstall, degradation, footprint, and privacy gates.
- **Release Validation Run**: Milestone or release-band gate execution with pass/fail evidence, skipped/degraded reasons, artifacts, and risks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean supported workstation, an operator can initialize Fulcrum, start the daemon, create a task and supervised run, stop/restart, and verify state preservation with no cloud credentials or remote services.
- **SC-002**: 100% of canonical records created during core smoke survive daemon restart and backup/restore verification.
- **SC-003**: `core` setup plan, install, doctor, status, backup, restore, export, import, reset preview, rebuild-index preview, and uninstall preview produce human-readable output and machine-readable output, including JSONL setup install step events.
- **SC-004**: For each selected setup profile, doctor reports every required dependency as `managed`, `detected`, `guided`, `optional`, or `blocked` with exact remediation for all blocked items.
- **SC-005**: Offline setup mode performs zero network access and either succeeds from cache/host tools or blocks with exact missing assets.
- **SC-006**: Memory doctor blocks readiness when provider configuration is missing or embedding dimensions mismatch existing vectors, while core status remains usable.
- **SC-007**: CLI and cockpit/TUI show the same task, run, blocker, artifact, policy, adapter-health, and sidecar-health state within one live event propagation cycle.
- **SC-008**: Event replay reconstructs task/run/cockpit state for representative core workflows with no missing terminal transition or artifact records.
- **SC-009**: Code profile can index a real project, update results on create/update/delete/rename, and return exact symbol/path/phrase results above weak semantic results for identifier-like fixture queries.
- **SC-010**: 100% of context-pack evidence items include type, provenance class, source reference, freshness/degraded status, and explanation metadata.
- **SC-011**: Markdown/L0 memory import, update, delete/tombstone, and query smoke tests show changed recall results with cited source provenance.
- **SC-012**: Graph refs update after representative task, run, artifact, code, memory, delete, and rename changes without requiring full rebuild.
- **SC-013**: Worktree delivery smoke covers allocation, dirty-state visibility, artifact attachment, review queue, successful merge, conflict block, and unsafe cleanup refusal.
- **SC-014**: Optional action profile smoke maps an external action/job status and logs back to Fulcrum action events and artifacts without mutating run lifecycle directly.
- **SC-015**: Optional PM adapter certification demonstrates import/export/sync mapping, reversible conflicts, outage behavior, and core cockpit independence before Adapter Beta.
- **SC-016**: Privacy validation proves first-run network-deny behavior, loopback default, secret redaction, ignore-rule exclusion from indexing/retrieval, purge behavior, backup preservation, and explicit remote opt-in warnings.
- **SC-017**: Local Alpha cannot be claimed until M0-M2 gates pass; Useful Alpha cannot be claimed until M0-M6 gates pass; Adapter Beta cannot be claimed until optional adapter certification passes; Release Candidate cannot be claimed until M0-M12 privacy, packaging, graph, RAG, setup, and recovery gates pass.
- **SC-018**: Every open design decision in the roadmap is assigned to a milestone gate, certification report, or documented assumption before implementation planning proceeds.

## Assumptions

- The 2026-04-24 Fulcrum CLI Agent OS roadmap is canonical over its source plan documents.
- Current repository state is alpha/spike foundation, not product-ready.
- Local Alpha is M0-M2; Useful Alpha includes M6 setup/profile gates because useful code/memory claims require install and doctor proof.
- Supported alpha OS matrix, exact Windows home path, Windows packaging target, Tree-sitter language bundle, Zoekt distribution details, LanceDB integration path, LightRAG socket/port policy, graph stable ID scheme, query cache policy, tokenizer strategy, and exact quantitative RAG/model performance thresholds are milestone-bound decisions, not blockers for this specification.
- Default install remains `core`; default development target is `core` + `code` + markdown memory import.
- `code` and `memory` profile capabilities may use explicit degraded/fallback modes when preferred optional engines are unavailable, but fallback status must be visible.
- Remote providers can be recommended quality tiers only when explicitly configured by the operator and marked with visible privacy/cost status.
- Adapter names in this specification identify roadmap validation candidates and boundaries; certification decides whether any optional adapter becomes supported/default.
