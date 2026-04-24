# Tasks: Fulcrum CLI Agent OS Full Product Delivery

**Input**: Design documents from `specs/004-fulcrum-cli-agent-os-delivery/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Fulcrum constitution requires quality gates, privacy/no-network checks, provenance checks, policy-gate tests, recovery tests, adapter degradation tests, worktree safety tests, doctor tests, quickstart validation, and cross-surface parity tests.

**Organization**: Tasks are grouped by user story in priority order. Each story includes independent tests and implementation work that can be validated without completing lower-priority stories.

## Phase 1: Setup

**Purpose**: Create TypeScript-first monorepo skeleton, shared tooling, and local development entrypoints.

- [x] T001 Create TypeScript monorepo workspace manifests in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- [x] T002 [P] Create app package manifests and TypeScript configs in `apps/cli/package.json`, `apps/server/package.json`, `apps/cockpit/package.json`, and `apps/tui/package.json`
- [x] T003 [P] Create core package manifests and TypeScript configs in `packages/shared/package.json`, `packages/core/package.json`, and `packages/db/package.json`
- [x] T004 [P] Create adapter package manifests and TypeScript configs in `packages/mcp/package.json`, `packages/plane/package.json`, `packages/memory/package.json`, `packages/code-tools/package.json`, `packages/agents/package.json`, and `packages/policy/package.json`
- [x] T005 [P] Configure lint, format, and typecheck commands in `eslint.config.js`, `prettier.config.js`, and `package.json`
- [x] T006 [P] Configure Vitest, Playwright, and test path aliases in `vitest.config.ts`, `playwright.config.ts`, and `tests/setup/test-env.ts`
- [x] T007 Create local development configuration template in `configs/fulcrum.example.toml`
- [x] T008 Create CLI entrypoint scaffold in `apps/cli/src/main.ts`
- [x] T009 Create loopback server entrypoint scaffold in `apps/server/src/main.ts`
- [x] T010 Create cockpit Vite app scaffold in `apps/cockpit/src/main.tsx` and `apps/cockpit/src/App.tsx`, plus terminal dashboard scaffold in `apps/tui/src/main.ts`
- [x] T011 Create package barrel files in `packages/shared/src/index.ts`, `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/mcp/src/index.ts`, `packages/policy/src/index.ts`
- [x] T012 Document local development commands and no-network defaults in `README.md`

## Phase 2: Foundational

**Purpose**: Shared schemas, persistence, policy, event, adapter, and service foundations that block user-story implementation.

**Critical**: No user story work begins until this phase is complete.

- [x] T013 Define stable ID helpers and schema version constants in `packages/shared/src/ids.ts`
- [x] T014 [P] Define lifecycle enum schemas for tasks, runs, worktrees, gates, memory, sync, capabilities, and policy decisions in `packages/shared/src/lifecycle.ts`
- [x] T015 [P] Define shared error, redaction, degraded-state, provenance, and surface response schemas in `packages/shared/src/contracts/common.ts`
- [x] T016 Define entity schemas from `data-model.md` in `packages/shared/src/entities.ts`
- [x] T017 Define event schemas from `contracts/event-jsonl-contract.md` in `packages/shared/src/events.ts`
- [x] T018 Define CLI, API, MCP, and adapter contract schemas in `packages/shared/src/contracts/index.ts`
- [x] T019 Create SQLite migration runner in `packages/db/src/migrate.ts`
- [x] T020 Create initial SQLite schema migration for all canonical entities in `packages/db/migrations/0001_initial.sql`
- [x] T021 Implement SQLite repository transaction helper in `packages/db/src/transaction.ts`
- [x] T022 Implement append-only event repository and JSONL mirror writer in `packages/db/src/events.ts` and `packages/core/src/events/jsonl-writer.ts`
- [x] T023 [P] Add artifact contract tests for attach, show, list, redaction status, provenance, and storage references in `tests/contract/artifacts.test.ts`
- [x] T024 Implement artifact repository and local artifact storage layout in `packages/db/src/artifacts.ts` and `packages/core/src/artifacts/storage.ts`
- [x] T025 Implement artifact attach, show, list, provenance, retention, and redaction service in `packages/core/src/artifacts/service.ts`
- [x] T026 Wire artifact CLI and API surfaces in `apps/cli/src/commands/artifact.ts` and `apps/server/src/routes/artifacts.ts`
- [x] T027 Implement redaction utility and secret-pattern registry in `packages/policy/src/redaction.ts`
- [x] T028 Implement ignored-path policy resolver for `.gitignore`, `.ignore`, `.fulcrumignore`, and `.repomixignore` in `packages/core/src/privacy/ignored-paths.ts`
- [x] T029 Implement policy evaluator for destructive, remote, permanent-memory, public-bind, arbitrary-shell, backup-purge, and sensitive-export actions in `packages/policy/src/evaluator.ts`
- [x] T030 Implement preview model for broad or dangerous state changes in `packages/core/src/policy/previews.ts`
- [x] T031 Implement capability health model and doctor aggregation service in `packages/core/src/doctor/service.ts`
- [x] T032 Implement adapter base interface from `contracts/adapter-contract.md` in `packages/core/src/adapters/adapter.ts`
- [x] T033 Implement local-only mode network guard service in `packages/policy/src/local-only.ts`
- [x] T034 Implement shared core service container wiring repositories, policy, events, adapters, and redaction in `packages/core/src/container.ts`
- [x] T035 Create simulated adapter fixtures for external PM, memory, code, agent, semantic, and telemetry degradation in `tests/fixtures/adapters/`
- [x] T036 [P] Add unit tests for lifecycle transition validation in `tests/unit/lifecycle.test.ts`
- [x] T037 [P] Add unit tests for redaction and ignored-path behavior in `tests/unit/redaction-and-ignore.test.ts`
- [x] T038 [P] Add contract tests for shared response and error schemas in `tests/contract/shared-contracts.test.ts`
- [x] T039 [P] Add privacy no-network guard tests in `tests/privacy/no-network-core.test.ts`
- [x] T040 [P] Add policy deny/approval matrix tests in `tests/policy/policy-matrix.test.ts`
- [x] T041 Add cross-surface parity test harness helpers in `tests/integration/helpers/surface-parity.ts`

## Phase 3: User Story 1 - Install And Prove Local Readiness (Priority: P1)

**Goal**: Operator can preview setup, apply setup, run doctor, and see local/privacy/degraded status in human and JSON forms on a clean machine.

**Independent Test**: Run setup preview/apply and doctor with network unavailable; verify local state, required/optional capability states, exact next actions, and human/JSON parity.

### Tests And Validation for User Story 1

- [x] T042 [P] [US1] Add CLI contract tests for `fulcrum setup preview`, `fulcrum setup apply`, and `fulcrum doctor --json` in `tests/contract/cli-setup-doctor.test.ts`
- [x] T043 [P] [US1] Add integration test for clean setup and doctor journey in `tests/integration/setup-doctor-flow.test.ts`
- [x] T044 [P] [US1] Add privacy no-network setup and doctor test in `tests/privacy/setup-doctor-no-network.test.ts`
- [x] T045 [P] [US1] Add cockpit doctor accessibility and state test in `tests/e2e/cockpit-doctor.spec.ts`

### Implementation for User Story 1

- [x] T046 [US1] Implement setup preview service with local path, privacy, capability, and approval summary in `packages/core/src/setup/preview.ts`
- [x] T047 [US1] Implement setup apply service that initializes SQLite and local directories without unapproved global mutations in `packages/core/src/setup/apply.ts`
- [x] T048 [US1] Implement setup and doctor CLI commands in `apps/cli/src/commands/setup.ts` and `apps/cli/src/commands/doctor.ts`
- [x] T049 [US1] Implement setup and doctor API routes in `apps/server/src/routes/setup.ts` and `apps/server/src/routes/doctor.ts`
- [x] T050 [US1] Implement cockpit doctor and privacy status views in `apps/cockpit/src/routes/doctor.tsx` and `apps/cockpit/src/components/privacy-status.tsx`
- [x] T051 [US1] Persist setup state and capability health records through repositories in `packages/db/src/setup.ts` and `packages/db/src/capabilities.ts`
- [x] T052 [US1] Add setup/doctor quickstart validation command script in `tests/e2e/quickstart/setup-doctor.sh`

## Phase 4: User Story 2 - Register Projects And See Local Work Cockpit (Priority: P1)

**Goal**: Operator registers local repositories and sees projects, tasks, queues, run counts, health, and degraded states consistently in cockpit, CLI, and JSON.

**Independent Test**: Register two local repositories, create local tasks, open cockpit, compare project/task/run counts and health across CLI, API, cockpit, and JSON.

### Tests And Validation for User Story 2

- [x] T053 [P] [US2] Add project registry contract tests in `tests/contract/project-registry.test.ts`
- [x] T054 [P] [US2] Add cockpit and CLI project parity integration test in `tests/integration/project-cockpit-parity.test.ts`
- [x] T055 [P] [US2] Add local PM-free task workflow test in `tests/integration/local-task-workflow.test.ts`
- [x] T056 [P] [US2] Add cockpit keyboard and non-color status test in `tests/e2e/cockpit-project-board.spec.ts`

### Implementation for User Story 2

- [x] T057 [US2] Implement project registry service with stable IDs, root path, default branch, worktree policy, quality gates, privacy mode, and health in `packages/core/src/projects/service.ts`
- [x] T058 [US2] Implement local task service and task transition enforcement in `packages/core/src/tasks/service.ts`
- [x] T059 [US2] Implement project and task repositories in `packages/db/src/projects.ts` and `packages/db/src/tasks.ts`
- [x] T060 [US2] Implement project and task CLI commands in `apps/cli/src/commands/project.ts` and `apps/cli/src/commands/task.ts`
- [x] T061 [US2] Implement project, task, queue, and activity API routes in `apps/server/src/routes/projects.ts`, `apps/server/src/routes/tasks.ts`, and `apps/server/src/routes/queues.ts`
- [x] T062 [US2] Implement cockpit global overview and per-project board in `apps/cockpit/src/routes/overview.tsx` and `apps/cockpit/src/routes/project-board.tsx`
- [x] T063 [US2] Add queue summary projection for blockers, review, merge, active runs, and degraded states in `packages/core/src/queues/projections.ts`

## Phase 5: User Story 4 - Start Supervised Agent Runs (Priority: P1)

**Goal**: Operator starts a supervised CLI agent run and observes status, heartbeat, context, worktree, logs, artifacts, policy, and final outcome.

**Independent Test**: Use deterministic validation agent to emit heartbeat, write a file, attach artifact, run a quality gate, and complete; verify consistent run lifecycle across cockpit, CLI, JSON, and MCP.

### Tests And Validation for User Story 4

- [ ] T064 [P] [US4] Add run lifecycle contract tests in `tests/contract/run-lifecycle.test.ts`
- [ ] T065 [P] [US4] Add deterministic validation agent supervised run integration test in `tests/integration/validation-agent-run.test.ts`
- [ ] T066 [P] [US4] Add stale heartbeat and crash recovery test in `tests/recovery/run-stale-crash.test.ts`
- [ ] T067 [P] [US4] Add cancellation terminal-state test in `tests/integration/run-cancel.test.ts`

### Implementation for User Story 4

- [ ] T068 [US4] Implement run lifecycle service with terminal-state enforcement in `packages/core/src/runs/service.ts`
- [ ] T069 [US4] Implement run repository and event stream queries in `packages/db/src/runs.ts`
- [ ] T070 [US4] Implement agent process supervisor and cancellation handling in `packages/agents/src/supervisor.ts`
- [ ] T071 [US4] Implement deterministic validation agent in `packages/agents/src/validation-agent.ts`
- [ ] T072 [US4] Implement run CLI commands in `apps/cli/src/commands/run.ts`
- [ ] T073 [US4] Implement run API routes and live activity stream in `apps/server/src/routes/runs.ts` and `apps/server/src/routes/activity.ts`
- [ ] T074 [US4] Implement cockpit run detail and live activity components in `apps/cockpit/src/routes/run-detail.tsx` and `apps/cockpit/src/components/live-activity.tsx`
- [ ] T075 [US4] Implement run logs and transcript artifact capture in `packages/core/src/runs/log-capture.ts`

## Phase 6: User Story 5 - Build Explainable Context Packs (Priority: P1)

**Goal**: Operator or agent builds context packs with task details, memory, code evidence, recent runs, artifacts, policies, graph links, budget handling, omissions, and provenance.

**Independent Test**: Build context offline for a task linked to memory and code; verify every item has source ref, freshness, inclusion reason, evidence type, limitation, and budget behavior.

### Tests And Validation for User Story 5

- [ ] T076 [P] [US5] Add context pack schema contract tests in `tests/contract/context-pack.test.ts`
- [ ] T077 [P] [US5] Add offline context build integration test in `tests/integration/context-build-offline.test.ts`
- [ ] T078 [P] [US5] Add provenance and omitted-lane validation test in `tests/integration/context-provenance.test.ts`
- [ ] T079 [P] [US5] Add degraded memory/code lane test in `tests/integration/context-degraded-lanes.test.ts`

### Implementation for User Story 5

- [ ] T080 [US5] Implement context pack builder and lane budget allocator in `packages/core/src/context/builder.ts`
- [ ] T081 [US5] Implement context item ranking that prioritizes exact/path/structural evidence in `packages/core/src/context/ranking.ts`
- [ ] T082 [US5] Implement context repositories in `packages/db/src/context-packs.ts`
- [ ] T083 [US5] Implement context CLI command in `apps/cli/src/commands/context.ts`
- [ ] T084 [US5] Implement context API routes in `apps/server/src/routes/context-packs.ts`
- [ ] T085 [US5] Implement cockpit context evidence view in `apps/cockpit/src/routes/context-pack.tsx`
- [ ] T086 [US5] Implement context exports for markdown, JSON, prompt file, and MCP resource in `packages/core/src/context/export.ts`

## Phase 7: User Story 6 - Search Code With Provenance (Priority: P1)

**Goal**: Operator or agent searches code for exact identifiers, paths, strings, errors, symbols, imports, exports, dependencies, and optional semantic results with source references.

**Independent Test**: Search local repository for identifiers, paths, error strings, imports, and symbols; verify source refs, ignored-path behavior, result explanations, and stale cleanup.

### Tests And Validation for User Story 6

- [ ] T087 [P] [US6] Add code search contract tests in `tests/contract/code-search.test.ts`
- [ ] T088 [P] [US6] Add exact/path/string search integration test in `tests/integration/code-search-exact.test.ts`
- [ ] T089 [P] [US6] Add ignored-path privacy test for code search in `tests/privacy/code-search-ignore.test.ts`
- [ ] T090 [P] [US6] Add stale evidence rename/delete recovery test in `tests/recovery/code-evidence-stale.test.ts`

### Implementation for User Story 6

- [ ] T091 [US6] Implement ripgrep and path search adapter in `packages/code-tools/src/exact-search.ts`
- [ ] T092 [US6] Implement optional structural search adapter wrapper in `packages/code-tools/src/structural-search.ts`
- [ ] T093 [US6] Implement optional semantic search degraded adapter in `packages/code-tools/src/semantic-search.ts`
- [ ] T094 [US6] Implement code evidence service and stale cleanup in `packages/core/src/code/evidence-service.ts`
- [ ] T095 [US6] Implement code evidence repository in `packages/db/src/code-evidence.ts`
- [ ] T096 [US6] Implement code search CLI and API routes in `apps/cli/src/commands/code.ts` and `apps/server/src/routes/code.ts`
- [ ] T097 [US6] Add code evidence display to cockpit context view in `apps/cockpit/src/components/code-evidence-list.tsx`

## Phase 8: User Story 7 - Preserve And Recall Project Memory (Priority: P1)

**Goal**: Operator captures, curates, searches, stale-marks, approves, and exports local project memory with raw source provenance.

**Independent Test**: Import markdown memory, use memsearch and Engram-backed search when configured, search memory from a task, complete run with memory draft, approve it, mark stale after rename/delete, and export with source refs.

### Tests And Validation for User Story 7

- [ ] T098 [P] [US7] Add memory entry contract tests in `tests/contract/memory.test.ts`
- [ ] T099 [P] [US7] Add markdown, memsearch, and Engram memory import/search integration tests in `tests/integration/memory-backends.test.ts`
- [ ] T100 [P] [US7] Add permanent memory policy approval test in `tests/policy/memory-approval.test.ts`
- [ ] T101 [P] [US7] Add memory stale-link recovery test in `tests/recovery/memory-stale-links.test.ts`

### Implementation for User Story 7

- [ ] T102 [US7] Implement markdown, memsearch, and Engram memory adapters in `packages/memory/src/markdown-adapter.ts`, `packages/memory/src/memsearch-adapter.ts`, and `packages/memory/src/engram-adapter.ts`
- [ ] T103 [US7] Implement memory service for backend selection, import, search, draft, approve, stale mark, and export in `packages/core/src/memory/service.ts`
- [ ] T104 [US7] Implement memory repository in `packages/db/src/memory.ts`
- [ ] T105 [US7] Implement memory CLI commands in `apps/cli/src/commands/memory.ts`
- [ ] T106 [US7] Implement memory API routes in `apps/server/src/routes/memory.ts`
- [ ] T107 [US7] Implement cockpit memory draft and source provenance components in `apps/cockpit/src/routes/memory.tsx`
- [ ] T108 [US7] Implement memory export with provenance and redaction status in `packages/core/src/memory/export.ts`

## Phase 9: User Story 9 - Deliver Work Through Safe Worktrees (Priority: P1)

**Goal**: Each agent task works in isolated or policy-approved workspace with visible dirty state, artifacts, review status, merge readiness, and cleanup safety.

**Independent Test**: Allocate worktree, make tracked/untracked changes, attempt cleanup, review artifacts, approve merge readiness, and verify unsafe cleanup is blocked.

### Tests And Validation for User Story 9

- [ ] T109 [P] [US9] Add worktree allocation contract tests in `tests/contract/worktree.test.ts`
- [ ] T110 [P] [US9] Add dirty and untracked cleanup block integration test in `tests/integration/worktree-cleanup-block.test.ts`
- [ ] T111 [P] [US9] Add unpushed commit and conflict safety test in `tests/recovery/worktree-unsafe-states.test.ts`
- [ ] T112 [P] [US9] Add merge readiness policy test in `tests/policy/worktree-merge-readiness.test.ts`

### Implementation for User Story 9

- [ ] T113 [US9] Implement worktree allocation service in `packages/core/src/worktrees/allocation.ts`
- [ ] T114 [US9] Implement Git status inspection and cleanup eligibility service in `packages/core/src/worktrees/status.ts`
- [ ] T115 [US9] Implement worktree repository in `packages/db/src/worktrees.ts`
- [ ] T116 [US9] Implement worktree CLI commands in `apps/cli/src/commands/worktree.ts`
- [ ] T117 [US9] Implement worktree API routes in `apps/server/src/routes/worktrees.ts`
- [ ] T118 [US9] Implement cockpit worktree delivery view in `apps/cockpit/src/routes/worktree-detail.tsx`
- [ ] T119 [US9] Integrate worktree allocation into run start service in `packages/core/src/runs/start-run.ts`

## Phase 10: User Story 10 - Enforce Policy Gates And Privacy Controls (Priority: P1)

**Goal**: Fulcrum requires approval or denial for destructive, externally visible, permanent-memory, public-bind, arbitrary-shell, remote-provider, and sensitive-export actions across CLI, cockpit, and MCP.

**Independent Test**: Attempt dangerous actions from CLI, cockpit, and MCP under default policy; verify approvals, denials, redaction, local-only blocking, and audit records.

### Tests And Validation for User Story 10

- [ ] T120 [P] [US10] Add policy action matrix contract tests in `tests/contract/policy-contract.test.ts`
- [ ] T121 [P] [US10] Add cross-surface policy parity integration test in `tests/integration/policy-cross-surface.test.ts`
- [ ] T122 [P] [US10] Add local-only remote action denial test in `tests/privacy/local-only-denies-remote.test.ts`
- [ ] T123 [P] [US10] Add secret redaction validation test in `tests/privacy/secret-redaction.test.ts`

### Implementation for User Story 10

- [ ] T124 [US10] Implement policy decision repository and audit event linking in `packages/db/src/policy-decisions.ts`
- [ ] T125 [US10] Implement policy CLI commands in `apps/cli/src/commands/policy.ts`
- [ ] T126 [US10] Implement policy API routes and approval flow in `apps/server/src/routes/policy.ts`
- [ ] T127 [US10] Implement cockpit policy approval queue in `apps/cockpit/src/routes/policy-approvals.tsx`
- [ ] T128 [US10] Wire policy evaluator into run, worktree, memory, quality, backup, export, adapter, and server bind services in `packages/core/src/policy/enforcement.ts`
- [ ] T129 [US10] Implement redaction status display helpers in `apps/cockpit/src/components/redaction-status.tsx` and `apps/cli/src/output/redaction.ts`
- [ ] T130 [US10] Add public-bind approval guard to server startup in `apps/server/src/bind-policy.ts`

## Phase 11: User Story 11 - Run Quality Gates And Capture Proof (Priority: P1)

**Goal**: Fulcrum runs project-defined quality gates, stores outputs, and blocks readiness/writeback/merge/completion claims without required passing evidence.

**Independent Test**: Define fast, lint, format, security, and custom gates; run pass/fail/timeout/skipped cases; verify artifacts and readiness decisions.

### Tests And Validation for User Story 11

- [ ] T131 [P] [US11] Add quality gate contract tests in `tests/contract/quality-gates.test.ts`
- [ ] T132 [P] [US11] Add quality gate execution integration test in `tests/integration/quality-gate-runner.test.ts`
- [ ] T133 [P] [US11] Add required-gate readiness block policy test in `tests/policy/quality-required-blocks.test.ts`
- [ ] T134 [P] [US11] Add quality output redaction privacy test in `tests/privacy/quality-output-redaction.test.ts`

### Implementation for User Story 11

- [ ] T135 [US11] Implement quality gate definition and result repositories in `packages/db/src/quality-gates.ts`
- [ ] T136 [US11] Implement quality gate runner service with timeout, status, output artifact capture, and parsed summary in `packages/core/src/quality/runner.ts`
- [ ] T137 [US11] Implement readiness evaluator for required gate evidence and release exceptions in `packages/core/src/quality/readiness.ts`
- [ ] T138 [US11] Implement gate CLI commands in `apps/cli/src/commands/gate.ts`
- [ ] T139 [US11] Implement quality API routes in `apps/server/src/routes/quality.ts`
- [ ] T140 [US11] Implement cockpit quality gate panel in `apps/cockpit/src/components/quality-gates.tsx`
- [ ] T141 [US11] Link quality results to run artifacts and events in `packages/core/src/runs/quality-links.ts`

## Phase 12: User Story 12 - Backup, Restore, Export, Rebuild, Reset, And Uninstall Safely (Priority: P1)

**Goal**: Operator can inspect, back up, restore, export, rebuild, reset, and uninstall local state with previews and preservation guarantees.

**Independent Test**: Create state with projects, tasks, runs, artifacts, memory, policies, and derived data; backup, restore, export, rebuild, reset preview, and uninstall preview without losing user work.

### Tests And Validation for User Story 12

- [ ] T142 [P] [US12] Add backup and restore contract tests in `tests/contract/recovery-contract.test.ts`
- [ ] T143 [P] [US12] Add backup/restore integration test in `tests/recovery/backup-restore.test.ts`
- [ ] T144 [P] [US12] Add rebuild derived data test in `tests/recovery/rebuild-derived-data.test.ts`
- [ ] T145 [P] [US12] Add reset and uninstall destructive preview policy test in `tests/policy/reset-uninstall-preview.test.ts`

### Implementation for User Story 12

- [ ] T146 [US12] Implement backup manifest service and repository in `packages/core/src/recovery/backup.ts` and `packages/db/src/backups.ts`
- [ ] T147 [US12] Implement restore validation service in `packages/core/src/recovery/restore.ts`
- [ ] T148 [US12] Implement export service with provenance and redaction status in `packages/core/src/recovery/export.ts`
- [ ] T149 [US12] Implement rebuild orchestration for indexes, projections, repo maps, memory indexes, code refs, and context previews in `packages/core/src/recovery/rebuild.ts`
- [ ] T150 [US12] Implement reset and uninstall preview service in `packages/core/src/recovery/reset-uninstall.ts`
- [ ] T151 [US12] Implement backup, restore, export, rebuild, reset, and uninstall CLI commands in `apps/cli/src/commands/recovery.ts`
- [ ] T152 [US12] Implement recovery API routes and cockpit recovery view in `apps/server/src/routes/recovery.ts` and `apps/cockpit/src/routes/recovery.tsx`

## Phase 13: User Story 3 - Mirror Optional External Project Management (Priority: P2)

**Goal**: Operator can import, link, sync, and preview writeback for external PM work while Fulcrum local task/run state remains canonical.

**Independent Test**: Use configured Plane adapter and simulated fixture to import work, disconnect adapter, continue local runs, reconnect, and verify status mapping, docs/pages memory source handling, sync status, conflicts, and writeback previews.

### Tests And Validation for User Story 3

- [ ] T153 [P] [US3] Add external PM and Plane adapter contract tests in `tests/contract/external-pm-adapter.test.ts`
- [ ] T154 [P] [US3] Add Plane import/disconnect/reconnect, status mapping, docs/pages memory source, and writeback integration tests in `tests/integration/plane-mirror-sync.test.ts`
- [ ] T155 [P] [US3] Add external writeback preview policy test in `tests/policy/external-writeback.test.ts`
- [ ] T156 [P] [US3] Add PM adapter outage degradation test in `tests/integration/pm-adapter-degraded.test.ts`

### Implementation for User Story 3

- [ ] T157 [US3] Implement external work item mirror repository in `packages/db/src/external-work-items.ts`
- [ ] T158 [US3] Implement external PM adapter interface, real Plane API adapter, and simulated test fixture in `packages/plane/src/adapter.ts`, `packages/plane/src/plane-adapter.ts`, and `packages/plane/src/simulated-adapter.ts`
- [ ] T159 [US3] Implement PM import, status mapping, docs/pages memory source registration, sync status, conflict, and writeback preview service in `packages/core/src/external-pm/service.ts`
- [ ] T160 [US3] Implement external PM and Plane CLI commands in `apps/cli/src/commands/plane.ts`
- [ ] T161 [US3] Implement PM API routes in `apps/server/src/routes/external-pm.ts`
- [ ] T162 [US3] Implement cockpit external mirror and writeback preview components in `apps/cockpit/src/components/external-mirror.tsx`
- [ ] T163 [US3] Link external PM health into doctor and adapter settings in `packages/core/src/doctor/pm-health.ts`

## Phase 14: User Story 8 - Connect Memory, Code, Work, Runs, And Artifacts (Priority: P2)

**Goal**: Operator can trace why work happened and what it affected through rebuildable graph-like links among tasks, memory, code, runs, artifacts, context, quality, and policy.

**Independent Test**: Link task to memory, code, run, context pack, artifact, and policy decision; answer traceability questions and rebuild projections from canonical records.

### Tests And Validation for User Story 8

- [ ] T164 [P] [US8] Add graph link contract tests in `tests/contract/graph-links.test.ts`
- [ ] T165 [P] [US8] Add traceability query integration test in `tests/integration/traceability-queries.test.ts`
- [ ] T166 [P] [US8] Add graph projection rebuild recovery test in `tests/recovery/graph-rebuild.test.ts`
- [ ] T167 [P] [US8] Add stale evidence limitation display test in `tests/integration/graph-stale-limitations.test.ts`

### Implementation for User Story 8

- [ ] T168 [US8] Implement graph link repository in `packages/db/src/graph-links.ts`
- [ ] T169 [US8] Implement graph link service and rebuild source mapping in `packages/core/src/graph/service.ts`
- [ ] T170 [US8] Implement traceability query service for context, memory, code, run, artifact, and policy links in `packages/core/src/graph/queries.ts`
- [ ] T171 [US8] Implement graph CLI commands in `apps/cli/src/commands/graph.ts`
- [ ] T172 [US8] Implement graph API routes in `apps/server/src/routes/graph.ts`
- [ ] T173 [US8] Implement cockpit traceability view in `apps/cockpit/src/routes/traceability.tsx`
- [ ] T174 [US8] Integrate graph links into context, memory, code, run, artifact, quality, and policy services in `packages/core/src/graph/link-writers.ts`

## Phase 15: User Story 13 - Use Agent-Facing MCP And Machine Interfaces (Priority: P2)

**Goal**: Agents use stable local machine interfaces for task, run, context, memory, code, artifact, quality, and policy capabilities under the same rules visible to the operator.

**Independent Test**: Deterministic validation agent fetches task, builds context, searches memory/code, emits heartbeat, attaches artifact, checks policy, runs quality gate, and completes through MCP while cockpit shows identical state.

### Tests And Validation for User Story 13

- [ ] T175 [P] [US13] Add MCP tool schema contract tests in `tests/contract/mcp-tools.test.ts`
- [ ] T176 [P] [US13] Add stdio MCP validation-agent integration test in `tests/integration/mcp-stdio-agent.test.ts`
- [ ] T177 [P] [US13] Add MCP policy bypass prevention test in `tests/policy/mcp-policy-gates.test.ts`
- [ ] T178 [P] [US13] Add MCP/cockpit/CLI parity test in `tests/integration/mcp-surface-parity.test.ts`

### Implementation for User Story 13

- [ ] T179 [US13] Implement MCP stdio server with TypeScript SDK in `packages/mcp/src/server.ts`
- [ ] T180 [US13] Implement MCP task, run, heartbeat, event, context, memory, code, artifact, quality, policy, worktree, and doctor tools in `packages/mcp/src/tools.ts`
- [ ] T181 [US13] Implement MCP resources for projects, tasks, runs, context packs, artifacts, and doctor in `packages/mcp/src/resources.ts`
- [ ] T182 [US13] Implement structured MCP error mapping in `packages/mcp/src/errors.ts`
- [ ] T183 [US13] Wire MCP CLI/server command entrypoints in `apps/cli/src/commands/mcp.ts` and `apps/server/src/mcp.ts`
- [ ] T184 [US13] Document local stdio and loopback MCP configuration in `docs/mcp-local.md`
- [ ] T185 [US13] Add MCP tool visibility and permissions display to cockpit adapter settings in `apps/cockpit/src/routes/adapters.tsx`

## Phase 16: User Story 14 - Operate With Optional Adapters And Degraded Capabilities (Priority: P2)

**Goal**: External tools, agents, memory backends, code search backends, semantic backends, PM systems, model providers, and telemetry providers are optional, health-checked, replaceable, and visibly degraded.

**Independent Test**: Enable/disable representative adapters, simulate unavailable tools and remote services, and verify core local workflows continue with explicit degradation and no data ownership transfer.

### Tests And Validation for User Story 14

- [ ] T186 [P] [US14] Add adapter base contract tests in `tests/contract/adapter-base.test.ts`
- [ ] T187 [P] [US14] Add adapter enable/disable and outage integration test in `tests/integration/adapter-degradation.test.ts`
- [ ] T188 [P] [US14] Add credential privacy status test in `tests/privacy/adapter-credentials.test.ts`
- [ ] T189 [P] [US14] Add adapter replacement preservation test in `tests/recovery/adapter-replacement.test.ts`

### Implementation for User Story 14

- [ ] T190 [US14] Implement adapter configuration repository in `packages/db/src/adapters.ts`
- [ ] T191 [US14] Implement adapter registry, health check, enable, disable, and replacement service in `packages/core/src/adapters/registry.ts`
- [ ] T192 [US14] Implement memory, code, semantic, agent, telemetry, observability, and remote-provider adapter health modules, including standalone `copilot` command detection, in `packages/core/src/adapters/health-modules.ts`
- [ ] T193 [US14] Implement adapter CLI commands in `apps/cli/src/commands/adapter.ts`
- [ ] T194 [US14] Implement adapter API routes in `apps/server/src/routes/adapters.ts`
- [ ] T195 [US14] Implement cockpit adapter settings and degraded capability display in `apps/cockpit/src/routes/adapters.tsx`
- [ ] T196 [US14] Integrate adapter health into doctor, context, memory, code, run, and policy services in `packages/core/src/adapters/degradation-wiring.ts`

## Phase 17: Polish And Cross-Cutting Validation

**Purpose**: Prove whole product coherence, documentation, performance, parity, and release readiness.

- [ ] T197 [P] Run full quickstart validation and store evidence in `tests/e2e/quickstart/full-operator-validation.sh`
- [ ] T198 [P] Add success-criteria fixture for 25 projects, 1,000 tasks, 10,000 events, 500 artifacts, and 100 memory entries in `tests/fixtures/scale/`
- [ ] T199 [P] Add common status performance tests for project list, task list, run status, and health summary in `tests/integration/status-performance.test.ts`
- [ ] T200 [P] Add cockpit primary workflow accessibility tests in `tests/e2e/cockpit-accessibility.spec.ts`
- [ ] T201 Add cross-surface parity suite covering CLI, cockpit, JSON, MCP, and local health reports in `tests/integration/cross-surface-parity.test.ts`
- [ ] T202 Add end-to-end no-network product workflow test in `tests/privacy/local-only-product-flow.test.ts`
- [ ] T203 Add provenance completeness test for context, code, memory, artifacts, quality gates, and exports in `tests/integration/provenance-completeness.test.ts`
- [ ] T204 Add policy coverage test for all dangerous actions listed in the constitution in `tests/policy/constitution-dangerous-actions.test.ts`
- [ ] T205 Add backup/restore/export/rebuild/reset/uninstall release gate test in `tests/recovery/release-recovery-gates.test.ts`
- [ ] T206 Add two-configured-agent lifecycle validation covering shared task, run, context, artifact, quality, and policy state in `tests/integration/two-agent-lifecycle.test.ts`
- [ ] T207 Add release acceptance operator review validation fixtures and evidence capture for task, context, changed files, quality gates, policy decision, and next-action recognition in `tests/e2e/release-acceptance-operator-review.spec.ts`
- [ ] T208 Update operator documentation for install, doctor, cockpit, MCP, adapters, policy, worktrees, quality gates, and recovery in `docs/operator-guide.md`
- [ ] T209 Update architecture documentation for TypeScript boundaries, SQLite canonical state, adapters, events, and Go escape hatch criteria in `docs/architecture.md`
- [ ] T210 Add release checklist mapping every success criterion SC-001 through SC-022 to validation evidence in `docs/release-checklist.md`
- [ ] T211 [P] Add full SRS CLI command coverage contract tests for setup, doctor, repair, uninstall, project, external PM, task, context, code, memory, run, worktree, gate, artifact, backup, restore, export, and rebuild commands in `tests/contract/cli-full-srs-commands.test.ts`
- [ ] T212 [P] Add full SRS MCP tool coverage and MCP call logging tests in `tests/contract/mcp-full-srs-tools.test.ts`
- [ ] T213 Implement missing CLI command surfaces and aliases required by `contracts/cli-contract.md` in `apps/cli/src/commands/`
- [ ] T214 Implement missing MCP tools, aliases, resources, and call logging required by `contracts/mcp-tool-contract.md` in `packages/mcp/src/tools.ts`, `packages/mcp/src/resources.ts`, and `packages/mcp/src/call-log.ts`
- [ ] T215 Implement terminal dashboard/TUI views for dashboard, projects, tasks, runs, worktrees, artifacts, context packs, quality gates, doctor, and event stream in `apps/tui/src/views/`
- [ ] T216 Add terminal dashboard/TUI parity tests against CLI, cockpit, MCP, JSON/JSONL, and health output in `tests/integration/tui-surface-parity.test.ts`
- [ ] T217 Add optional observability adapter tests for disabled-by-default OpenTelemetry, Langfuse, and Helicone-style exporters in `tests/privacy/observability-disabled-by-default.test.ts`
- [ ] T218 Update release checklist mapping SC-021 and SC-022 plus every SRS command/tool coverage item to validation evidence in `docs/release-checklist.md`
- [ ] T219 Add real Plane adapter acceptance coverage for connect, doctor, import, sync, link-task, writeback, status mapping, docs/pages memory source registration, outage recovery, and local-history preservation in `tests/integration/plane-full-acceptance.test.ts`
- [ ] T220 Add memsearch and Engram adapter acceptance coverage for install guidance, doctor health, search, writeback, degraded fallback, context-pack inclusion, rebuild, and export provenance in `tests/integration/memory-backend-acceptance.test.ts`
- [ ] T221 Implement standalone GitHub Copilot CLI agent profile, wrapper, prompt mode, plugins, skills, session persistence, subagents/fleet capability model, install hints, version/auth/policy/MCP doctor checks, and `gh copilot` rejection in `packages/agents/src/copilot.ts` and `packages/core/src/doctor/copilot.ts`
- [ ] T222 Implement optional OpenTelemetry, Langfuse, and Helicone-style observability adapters with disabled-by-default config, local-only blocking, redaction, export path, and health/privacy status in `packages/core/src/observability/adapters.ts`
- [ ] T223 Add global CLI flag coverage for `--config`, `--project`, `--task`, `--run`, `--local-only`, `--preview`, `--dry-run`, `--yes`, `--verbose`, and `--no-color` in `tests/contract/cli-global-flags.test.ts`

## Dependencies And Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **P1 Stories**: Depend on Foundational. Recommended order for full-delivery confidence: US1, US2, US4, US5, US6, US7, US9, US10, US11, US12.
- **P2 Stories**: Depend on relevant P1 services. US3 depends on US2 and US10. US8 depends on US5, US6, US7, US4, and US11. US13 depends on US4, US5, US6, US7, US10, and US11. US14 depends on Foundational and benefits from all adapter-touching stories.
- **Polish**: Depends on all user stories and all release evidence for this full-product specification. Selected stories may be validated earlier only as internal milestone checkpoints.

### User Story Dependencies

- **US1**: Independent after Foundational.
- **US2**: Independent after Foundational; needs setup state from US1 for full quickstart but can be tested with seeded setup.
- **US4**: Depends on task/project foundation from US2 for realistic runs.
- **US5**: Depends on task/project foundation from US2; integrates with US4 when run-linked.
- **US6**: Depends on project registry from US2.
- **US7**: Depends on project registry from US2 and policy foundation from Phase 2.
- **US9**: Depends on project/task/run services from US2 and US4.
- **US10**: Depends on policy foundation; must be integrated into all state-changing surfaces.
- **US11**: Depends on project/run/artifact services from US2 and US4.
- **US12**: Depends on canonical repositories and artifacts from prior P1 stories.
- **US3**: Depends on local tasks and policy gates from US2 and US10.
- **US8**: Depends on context, memory, code, run, artifact, quality, and policy records.
- **US13**: Depends on core services for each exposed MCP capability.
- **US14**: Depends on adapter base interface and integrates across all optional domains.

## Parallel Opportunities

- Setup tasks T002 through T006 can run in parallel after T001.
- Foundational schema tasks T013 through T018 can run in parallel with repository scaffolding T019 through T022 after workspace setup.
- Foundational test tasks T036 through T040 can run in parallel once schemas and policy foundation are defined.
- Tests within each user story are marked `[P]` and can be authored in parallel before implementation.
- P1 stories can be split after Phase 2 by domain with coordination on shared schemas: setup/doctor, projects/tasks, runs, context, code, memory, worktrees, policy, quality, recovery.
- P2 adapter and MCP work can run in parallel after the relevant P1 core services expose stable interfaces.

## Parallel Example: P1 Domain Split

```text
Engineer A: T042-T052 for US1 setup and doctor
Engineer B: T053-T063 for US2 projects, tasks, cockpit board
Engineer C: T064-T075 for US4 supervised runs
Engineer D: T120-T130 for US10 policy/privacy gates
```

## Full Delivery Scope

Full delivery is all phases, all user stories, all SRS command/tool surfaces, terminal dashboard/TUI, and all cross-cutting release evidence. Internal sequencing may start with setup, foundation, local readiness, project/task cockpit, supervised run, policy gates, quality evidence, and recovery, but this specification is complete only after external PM, memory, code context, graph links, MCP, adapters, observability controls, and every release criterion are implemented and validated.

## Implementation Strategy

1. Complete Setup and Foundational phases with schemas, migrations, policy, events, and test harnesses.
2. Deliver US1 and validate clean local setup plus doctor in no-network mode.
3. Deliver US2 and validate cockpit/CLI/JSON parity for projects and local tasks.
4. Deliver US4 with deterministic validation agent and real-agent supervised run paths plus event/artifact capture.
5. Deliver US10 policy gates before expanding dangerous workflows.
6. Add US5, US6, US7, US9, US11, and US12 as independent P1 product slices with their tests.
7. Add P2 adapter, graph, MCP, and degradation stories after P1 service contracts stabilize.
8. Finish with release evidence for every SRS command group, every SRS MCP tool, terminal dashboard/TUI parity, quickstart, privacy/no-network, provenance, cross-surface parity, policy coverage, worktree safety, adapter degradation, observability-disabled defaults, and recovery.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For task execution,
prioritize [$speckit-tasks](/home/mkh/.agents/skills/speckit-tasks/SKILL.md),
[$planning-and-task-breakdown](/home/mkh/.raise/profiles/vanilla/codex/skills/planning-and-task-breakdown/SKILL.md),
[$speckit-implement](/home/mkh/.agents/skills/speckit-implement/SKILL.md),
[$incremental-implementation](/home/mkh/.raise/profiles/vanilla/codex/skills/incremental-implementation/SKILL.md),
[$test-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/test-driven-development/SKILL.md),
[$granular-feature-acceptance-auditor](/home/mkh/.raise/profiles/vanilla/codex/skills/granular-feature-acceptance-auditor/SKILL.md),
[$integration-utilization-auditor](/home/mkh/.raise/profiles/vanilla/codex/skills/integration-utilization-auditor/SKILL.md),
and [$speckit-taskstoissues](/home/mkh/.agents/skills/speckit-taskstoissues/SKILL.md).
