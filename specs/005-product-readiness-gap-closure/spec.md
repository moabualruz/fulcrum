# Feature Specification: Fulcrum Product Readiness Gap Closure

**Feature Branch**: `005-product-readiness-gap-closure`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User request: "Add all missing Product/SRS parts as new stories and full spec workflow so I can run that and fully have it ready."

## Source Order

This gap-closure feature treats these files as acceptance sources:

1. `FULCRUM_PRODUCT.md` is the clean-slate product definition.
2. `SRS-ammend-02.md` wins language/runtime direction conflicts: TypeScript-first, cockpit-first, Go only as escape hatch.
3. `SRS-ammend-01.md` wins Copilot CLI target conflicts: standalone `copilot`, not `gh copilot`.
4. `SRS.md` remains authoritative for detailed tool, command, doctor, adapter, MCP, data, validation, and release acceptance requirements unless superseded above.
5. `specs/004-fulcrum-cli-agent-os-delivery/` is prior implementation evidence, not proof of full readiness when product/SRS gaps remain.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Product/SRS Compliance Authority (Priority: P1)

As the operator, I want Fulcrum to maintain an executable compliance matrix from the product document and SRS files so that implementation cannot call itself done while required behavior is partial, mocked, preview-only, or undocumented.

**Why this priority**: The prior spec let "full product" language become checkboxes without proving all source requirements. A compliance gate prevents repeat drift.

**Independent Test**: Run the compliance command against `FULCRUM_PRODUCT.md`, `SRS.md`, `SRS-ammend-01.md`, `SRS-ammend-02.md`, and implementation evidence; verify every requirement is classified as implemented, partial, missing, deferred with rationale, or superseded.

**Acceptance Scenarios**:

1. **Given** source docs and current code, **When** compliance audit runs, **Then** every product/SRS requirement has a stable ID, source ref, implementation ref, test ref, owner story, and status.
2. **Given** a requirement is satisfied only by a stub, preview-only command, mock-only test, or documentation claim, **When** audit runs, **Then** it is marked partial or missing, not complete.
3. **Given** source docs conflict, **When** audit runs, **Then** it applies the Source Order and records the superseded requirement with reason.
4. **Given** implementation drifts after changes, **When** release validation runs, **Then** the compliance gate fails with exact next actions.

---

### User Story 2 - Packaged Local Product Install (Priority: P1)

As a new operator, I want one documented and checked install/start path that provides the `fulcrum` command, local API server, cockpit, TUI, and MCP without manual source knowledge so that I can use the product rather than operate a development checkout.

**Why this priority**: The product promises local install readiness; current state is source-checkout dev commands.

**Independent Test**: From a clean clone or package artifact, install dependencies, build/package Fulcrum, run `fulcrum setup apply`, run `fulcrum doctor --json --no-network`, start `fulcrum server`, open cockpit on loopback, run `fulcrum tui`, and run `fulcrum mcp stdio`.

**Acceptance Scenarios**:

1. **Given** a clean supported machine, **When** the operator follows the install guide, **Then** a `fulcrum` executable is available on PATH or via a documented package runner.
2. **Given** setup apply completes, **When** doctor runs, **Then** all required source/runtime/package capabilities are checked with exact next actions.
3. **Given** the operator starts the product, **When** server starts, **Then** local API and cockpit bind to loopback by default and expose URL, state root, privacy status, and shutdown instructions.
4. **Given** optional packaging targets are unavailable, **When** package validation runs, **Then** npm/pnpm source package remains usable and Bun/single-binary status is visibly degraded, not hidden.

---

### User Story 3 - SQLite Canonical State Cutover (Priority: P1)

As an operator, I want projects, tasks, runs, events, artifacts, memory metadata, adapters, quality gates, policies, backups, exports, and graph links to use SQLite as canonical state so that restart, backup, restore, parity, and audit behavior are durable.

**Why this priority**: Product and SRS require durable local canonical state. File-backed work state is acceptable only as export/mirror, not execution truth.

**Independent Test**: Create product state through CLI/API/MCP, stop all processes, remove JSON work-state mirrors, restart, and verify all state survives from SQLite. Then backup/restore and cross-surface parity must still pass.

**Acceptance Scenarios**:

1. **Given** setup has initialized SQLite, **When** projects, tasks, runs, artifacts, policies, quality gates, and memory metadata are created, **Then** canonical records are persisted in SQLite repositories.
2. **Given** old JSON state exists, **When** migration runs, **Then** records are imported once, checksummed, backed up, and replaced by SQLite-backed services.
3. **Given** SQLite is missing or corrupt, **When** doctor or startup runs, **Then** Fulcrum blocks readiness and offers repair/restore next actions.
4. **Given** JSON/JSONL mirrors are generated, **When** they are deleted, **Then** Fulcrum rebuilds them from SQLite.

---

### User Story 4 - Complete Doctor Capability Matrix (Priority: P1)

As an operator, I want doctor to check every required and optional product capability from SRS so that missing local tools, adapters, credentials, privacy settings, and project readiness never surprise me during work.

**Why this priority**: Doctor is the readiness authority; current checks are not yet the full SRS matrix.

**Independent Test**: Run quick and deep doctor with controlled PATH/env/project fixtures that hide each tool or credential; verify JSON and human outputs agree, classify states correctly, and include exact next action.

**Acceptance Scenarios**:

1. **Given** local tools are missing, **When** doctor runs, **Then** it checks SQLite, event log, `git`, worktree support, `rg`, `fd`, `ast-grep`, Aider, Repomix, memsearch, Engram, quality gates, agent commands, MCP configs, ignore rules, redaction config, Plane, and observability/remote provider status.
2. **Given** doctor runs with `--no-network`, **When** remote checks would be needed, **Then** they are disabled/degraded without blocking core local workflows.
3. **Given** a project is registered, **When** `project doctor` runs, **Then** it reports per-project readiness including AGENTS/CLAUDE/GEMINI/OpenCode/Codex/Copilot MCP configuration where applicable.
4. **Given** a capability is blocked, **When** output is JSON or human-readable, **Then** both surfaces show same state, blocking flag, privacy status, freshness, and next action.

---

### User Story 5 - Real CLI Agent Acceptance (Priority: P1)

As an operator, I want at least two configured real CLI agents plus the deterministic validation agent to complete the same supervised run lifecycle so that Fulcrum proves it can orchestrate actual agent tools, not only test doubles.

**Why this priority**: The 004 spec says deterministic validation cannot substitute for real-agent acceptance.

**Independent Test**: Configure two available agent commands from Codex, Claude, Gemini, OpenCode, Copilot, Aider, Goose, OpenHands, Plandex, or generic shell; run the same task/context/artifact/quality/policy lifecycle; verify both finish with evidence or documented degraded state when unavailable.

**Acceptance Scenarios**:

1. **Given** two real agent commands are available, **When** Fulcrum starts supervised runs, **Then** each receives task/context through supported prompt mechanisms and runs inside assigned worktree.
2. **Given** an agent command is unavailable, **When** doctor and run start execute, **Then** the agent is guided/blocked with install hints and other healthy agents remain usable.
3. **Given** GitHub Copilot CLI is configured, **When** doctor checks it, **Then** Fulcrum detects standalone `copilot`, rejects `gh copilot`, and reports version/auth/policy/MCP/session/subagent capability status.
4. **Given** real-agent acceptance completes, **When** release evidence is inspected, **Then** every run links task, context, worktree, transcript, artifacts, gates, policy, summary, and memory recommendation.

---

### User Story 6 - Certified Optional Adapters (Priority: P1)

As an operator, I want Plane, memsearch, Engram, code tools, repo-map/repo-pack providers, semantic search, telemetry, observability, and remote providers to be real optional adapters with health checks, install guidance, offline behavior, and disablement safety.

**Why this priority**: Optional means replaceable and visibly degraded, not missing or placeholder.

**Independent Test**: Enable, disable, remove, and misconfigure each representative adapter; verify core workflows continue locally, affected workflows are visible, and external writeback/data sharing is policy gated.

**Acceptance Scenarios**:

1. **Given** Plane is configured, **When** import/sync/writeback runs, **Then** real API mode works or reports actionable degraded state; simulated mode remains test-only and labeled.
2. **Given** memsearch or Engram is configured, **When** memory import/search/rebuild/export runs, **Then** Fulcrum uses the real backend or degrades to local markdown with clear limitation.
3. **Given** `rg`, `fd`, `ast-grep`, Aider, or Repomix is installed, **When** code context commands run, **Then** Fulcrum records tool version, config hash, repo commit, included files, ignored paths, cache invalidation, and provenance.
4. **Given** telemetry or remote providers are disabled, **When** doctor, policy, or cockpit views run, **Then** they show disabled-by-default privacy status and local-only blocking.

---

### User Story 7 - Owned Cockpit Operations Center (Priority: P1)

As an operator, I want the cockpit UI to be a real local operations center for boards, queues, run supervision, review, merge readiness, policy approvals, health, adapters, context, memory, artifacts, quality gates, and recovery so that I do not need an external PM UI for core workflows.

**Why this priority**: Product definition and amendment 02 make cockpit first-class. It must be more than static parity screens.

**Independent Test**: Use cockpit only to register a project, create/transition a task, start/observe a run, inspect context/artifacts/gates/policies, review delivery state, and reach a release-ready decision with keyboard-accessible controls.

**Acceptance Scenarios**:

1. **Given** no external PM is configured, **When** the operator uses cockpit, **Then** global board, per-project board, queues, run detail, review queue, merge queue, health, and degraded states are fully usable.
2. **Given** a run is active, **When** cockpit is open, **Then** live activity, heartbeat/stale state, artifacts, gates, policy decisions, and next actions update from canonical state.
3. **Given** a policy approval or destructive preview is required, **When** cockpit presents it, **Then** expected effects, external visibility, affected records, and approval/deny controls are clear.
4. **Given** keyboard and non-color status tests run, **When** primary workflows are exercised, **Then** cockpit passes accessibility and parity requirements.

---

### User Story 8 - Incremental Graph And Cache Correctness (Priority: P1)

As an operator, I want graph links, code evidence, memory links, repo maps, repo packs, rankings, and context previews to update incrementally when sources change so that rebuild is a repair path, not normal correctness.

**Why this priority**: Product doc explicitly requires graph correctness on change.

**Independent Test**: Modify, rename, and delete files, memory entries, tasks, artifacts, and runs; verify affected links/caches update or become stale with next action before full rebuild is invoked.

**Acceptance Scenarios**:

1. **Given** a file, symbol, task, run, memory entry, artifact, or policy record changes, **When** Fulcrum observes or refreshes the source, **Then** related graph links and cache metadata update or mark stale.
2. **Given** repo HEAD, working tree, ignore rules, or code-context config changes, **When** repo-map/repo-pack/code evidence is requested, **Then** stale caches are invalidated before use.
3. **Given** a graph answer depends on missing evidence, **When** shown to operator or agent, **Then** it includes limitation, freshness, source refs, and next action.
4. **Given** derived data is deleted, **When** rebuild runs, **Then** it restores projections from SQLite and documented external sources.

---

### User Story 9 - Release Readiness Command And Evidence Pack (Priority: P1)

As an operator, I want one release-readiness workflow that executes install, setup, doctor, no-network, real-agent, cockpit, MCP, TUI, adapter, privacy, backup/restore, graph, packaging, and compliance checks so that I know Fulcrum is actually ready.

**Why this priority**: Product readiness must be evidence, not optimism.

**Independent Test**: Run `fulcrum release validate --evidence <dir>` or equivalent script from a clean environment and verify it produces a pass/fail summary plus linked artifacts for every source requirement group.

**Acceptance Scenarios**:

1. **Given** the product is ready, **When** release validation runs, **Then** it passes and writes evidence for compliance matrix, setup, doctor, install, package, CLI, server, cockpit, TUI, MCP, adapters, real agents, policies, quality gates, worktrees, graph/cache, backup/restore, export, privacy, and docs.
2. **Given** a check is preview-only, mock-only, or missing, **When** release validation runs, **Then** it fails with source requirement ID and next action.
3. **Given** network is unavailable, **When** local-only validation runs, **Then** core workflows pass and remote-only checks are disabled/degraded with explicit evidence.
4. **Given** validation completes, **When** docs are opened, **Then** a new operator can follow one guide from prerequisites to usable product.

## Edge Cases

- Existing `work-state.json` has records not in SQLite during cutover.
- Multiple source docs conflict on cockpit ownership, language, or Copilot command.
- Required binaries are missing from PATH, installed under alternate names, or version output is slow.
- Real agent commands exist but are unauthenticated, interactive-only, or call remote providers while local-only mode is active.
- Plane/memsearch/Engram endpoints are configured but unreachable or credential-expired.
- Repo-map or repo-pack tools include ignored or secret paths unless preflight catches them.
- Cockpit server port is busy; fallback must remain loopback and visible.
- SQLite migration fails mid-import; old state must remain recoverable.
- Release validation runs without network and must not hide skipped remote checks.
- Product runs from source checkout, npm package, or future Bun binary with equivalent behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Fulcrum MUST generate and maintain a Product/SRS compliance matrix with source refs, implementation refs, test refs, status, and next action.
- **FR-002**: Compliance status MUST distinguish implemented, partial, missing, deferred, superseded, mock-only, preview-only, and documentation-only.
- **FR-003**: Fulcrum MUST provide a packaged local install/start workflow that yields a usable `fulcrum` command or documented package runner.
- **FR-004**: Fulcrum MUST serve local API, cockpit, TUI, CLI, MCP, JSON, and health surfaces from documented start commands with loopback-only defaults.
- **FR-005**: Fulcrum MUST migrate remaining canonical work state from JSON files into SQLite repositories and keep JSON/JSONL only as mirrors/exports.
- **FR-006**: Fulcrum MUST block readiness when SQLite canonical state is missing, corrupt, or out of migration sync.
- **FR-007**: Doctor MUST implement the full SRS capability matrix for runtime, SQLite, event log, Git, code tools, memory backends, repo-map/repo-pack, PM, agents, MCP configs, quality gates, ignore/redaction, telemetry, observability, remote providers, and privacy.
- **FR-008**: Doctor quick and deep modes MUST produce equivalent state in human and JSON outputs.
- **FR-009**: At least two real CLI agents plus deterministic validation MUST complete or explicitly degrade through the same run lifecycle.
- **FR-010**: Copilot CLI integration MUST target standalone `copilot`, include install hints, reject `gh copilot`, and report version/auth/policy/MCP/plugins/skills/subagents/session capabilities where detectable.
- **FR-011**: Plane, memsearch, Engram, code tools, semantic search, telemetry, observability, remote providers, and CLI agents MUST be modeled as certified optional adapters with health, offline behavior, disablement behavior, import/export or rebuild behavior, credential status, and privacy notes.
- **FR-012**: Simulated adapters MUST be labeled as test-only and MUST NOT satisfy real-adapter release acceptance unless the requirement explicitly allows simulation.
- **FR-013**: Cockpit MUST support core owned workflows without external PM: project/task board, queues, run supervision, review/merge readiness, policies, adapters, context, memory, artifacts, quality, health, recovery, and live activity.
- **FR-014**: Cockpit, CLI, TUI, MCP, JSON/JSONL, and health reports MUST read/write the same canonical records or mark stale/partial/degraded state.
- **FR-015**: Graph links and cache records MUST update or mark stale on source changes before full rebuild is required.
- **FR-016**: Repo-map, repo-pack, code evidence, memory indexes, graph projections, rankings, and context previews MUST include invalidation metadata and rebuild source.
- **FR-017**: Fulcrum MUST provide one release-readiness command or script that produces an evidence pack covering all Product/SRS requirement groups.
- **FR-018**: Release readiness MUST fail on missing, partial, mock-only, preview-only, documentation-only, or unexecuted validation for non-deferred requirements.
- **FR-019**: The operator guide MUST include a single end-to-end path from prerequisites to validated product readiness.
- **FR-020**: All new flows MUST preserve local-first behavior, no hidden network access, redaction, ignore rules, policy gates, and user-work preservation.

### Key Entities

- **Compliance Requirement**: Source requirement with ID, source file, line/link, requirement text, priority, supersession status, implementation refs, test refs, evidence refs, status, and next action.
- **Install Target**: Package/start mode with command, runtime, artifact path, supported platform notes, required capabilities, and validation status.
- **Canonical Migration Record**: Tracks old state source, imported entity counts, checksum, backup path, migration status, and rollback/repair action.
- **Capability Probe**: Doctor check definition with capability ID, quick/deep mode, command/API/env probe, blocking rules, privacy status, and next action template.
- **Agent Certification**: Real agent profile with command, version, auth, supported prompt mechanisms, MCP/hook support, local-only behavior, acceptance runs, and evidence.
- **Adapter Certification**: Optional adapter health contract result with ownership boundary, offline behavior, disablement, credentials, privacy, import/export/rebuild, and test/live mode.
- **Cockpit Workflow Evidence**: UI journey record with source requirement, route/component, API calls, accessibility result, parity refs, and screenshot/video artifact when available.
- **Invalidation Record**: Cache/projection entry with source type, source hash, repo HEAD, working tree signature, ignore config hash, generated time, stale reason, and rebuild source.
- **Release Evidence Pack**: Manifest containing validation run ID, environment, commands, artifacts, logs, compliance result, pass/fail summary, and next actions.

## Fulcrum Constitution Alignment _(mandatory)_

### Local-First And Degraded Behavior

- Core workflow without network access: install from local/source package, setup, doctor, project/task/run, cockpit, TUI, MCP stdio, code search with local tools, markdown memory, worktrees, quality gates, policy, backup/restore/export/rebuild, and release local-only validation.
- Optional remote services or integrations: Plane, remote providers, telemetry, observability, semantic services, and network-backed memory adapters are opt-in and degrade with affected workflows.
- Hidden network prevention: release validation includes no-network checks; local-only policy blocks remote PM/model/telemetry/observability/public bind.

### Operator Control And Policy

- Human approval required for: package installs that mutate global state, public bind, external writeback, permanent memory, destructive cleanup/reset/uninstall, backup purge, arbitrary shell, merge, remote provider, sensitive export.
- Run/task visibility: real-agent acceptance and cockpit evidence must show task/run/context/worktree/artifact/gate/policy/next-action links.
- User work preservation: SQLite migration backs up old state; worktree cleanup remains blocked on dirty/untracked/unpushed/conflicted/active-run states.

### Canonical State And Provenance

- Canonical local records: SQLite projects, tasks, runs, events, worktrees, artifacts, context packs/items, memory metadata, code evidence, graph links, quality gates, policies, capabilities, adapters, backups, exports, compliance requirements, release evidence.
- External source-of-truth boundaries: Git owns repo content/history; external PM owns remote work text/status only when configured; agent providers own model internals; Fulcrum owns local execution truth and evidence.
- Rebuildable derived data: JSON/JSONL mirrors, repo maps, repo packs, search indexes, memory indexes, graph projections, rankings, context previews, cockpit projections, release reports.
- Evidence shown to operator/agent: source refs, freshness, inclusion reason, evidence type, confidence/limitation, redaction status, degraded state, linked task/run/artifact/policy IDs.

### Security And Privacy

- Sensitive data handled: private paths, source files, ignored paths, secrets, credentials, tokens, env vars, logs, transcripts, prompts, artifacts, context packs, adapter configs, release evidence.
- Redaction and ignore behavior: all broad pack, log, evidence, and export paths must honor ignore files and redaction registry; redaction status must be recorded.
- Trust boundaries: loopback HTTP, MCP stdio, local filesystem, Git, subprocess agents, optional external APIs, remote providers, telemetry exporters, package managers.
- Policy-gate tests required: public bind, external writeback, remote provider in local-only mode, telemetry enable, permanent memory, sensitive export, backup purge, reset/uninstall, worktree cleanup, arbitrary shell.

### TypeScript Boundary Discipline

- Packages touched: `apps/cli`, `apps/server`, `apps/cockpit`, `apps/tui`, `packages/core`, `packages/db`, `packages/mcp`, `packages/plane`, `packages/memory`, `packages/code-tools`, `packages/agents`, `packages/policy`, `packages/shared`, `docs`, `tests`.
- Shared schemas/contracts: compliance, capability probe, install target, migration record, adapter certification, agent certification, invalidation record, release evidence, doctor output, event contracts.
- Adapter boundaries: Plane, memory backends, code tools, repo-map/repo-pack, CLI agents, telemetry, observability, remote providers remain replaceable and disabled safely.
- Non-TypeScript or Bun-only exceptions: None. Bun packaging may be added only as optional target; Node/pnpm source package remains compatibility baseline.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Compliance audit covers 100% of requirement IDs extracted from Product/SRS sources and fails release readiness for every non-deferred missing or partial requirement.
- **SC-002**: A clean operator can reach `doctor --json --no-network` with `blockingCount: 0` and start CLI/server/cockpit/TUI/MCP from one guide in under 20 minutes.
- **SC-003**: 100% of canonical records created through CLI/API/MCP/cockpit survive process restart from SQLite after JSON mirrors are deleted.
- **SC-004**: Doctor fixture tests cover every SRS doctor capability with missing, healthy, disabled, and degraded cases where applicable.
- **SC-005**: At least two real configured CLI agents and the deterministic validation agent complete or explicitly degrade through identical task/run/context/artifact/gate/policy lifecycle evidence.
- **SC-006**: Cockpit primary workflows pass keyboard accessibility and cross-surface parity for project/task/run/review/policy/quality/recovery operations.
- **SC-007**: Cache/graph invalidation tests mark stale or update affected evidence within one refresh after file, memory, task, run, artifact, ignore, config, or HEAD changes.
- **SC-008**: Release validation writes an evidence pack with pass/fail result and next action for every major Product/SRS group.

## Assumptions

- Existing 004 implementation remains baseline and should be migrated forward, not discarded.
- Source-checkout operation remains supported even if package/binary targets are added.
- Real-agent acceptance can use locally installed commands available on the operator machine; unavailable commands must produce guided doctor output rather than block core local workflows.
- Network-backed integrations are optional and must not block local-only readiness.
