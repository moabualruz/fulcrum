# Tasks: Fulcrum Product Readiness Gap Closure

**Input**: Design documents from `specs/005-product-readiness-gap-closure/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: Required for every story. Release readiness must fail on missing, partial, mock-only, preview-only, documentation-only, or unexecuted evidence.

## Phase 1: Setup

- [x] T001 Add 005 feature pointer validation in `.specify/feature.json`
- [x] T002 [P] Add Product/SRS source fixture list in `tests/fixtures/compliance/source-order.json`
- [x] T003 [P] Add release evidence fixture directory layout in `tests/fixtures/release-evidence/README.md`
- [x] T004 Add shared scripts for clean local state setup in `tests/helpers/local-state.ts`
- [x] T005 Add package/start command inventory to `docs/operator-guide.md`

## Phase 2: Foundational

- [x] T006 Define compliance, install target, migration, capability probe, agent certification, adapter certification, invalidation, and release evidence schemas in `packages/shared/src/readiness.ts`
- [x] T007 Export readiness schemas from `packages/shared/src/index.ts`
- [x] T008 Add SQLite migration for compliance, install targets, migration records, capability probes, certifications, invalidation records, and release evidence in `packages/db/migrations/0002_readiness.sql`
- [x] T009 Implement readiness repositories in `packages/db/src/readiness.ts`
- [x] T010 Export readiness repositories from `packages/db/src/index.ts`
- [x] T011 Add core readiness service barrel in `packages/core/src/readiness/index.ts`
- [x] T012 Add policy actions for package/global mutation, release validation, adapter certification, and compliance override in `packages/policy/src/evaluator.ts`
- [x] T013 Add redaction coverage for release evidence and compliance exports in `packages/policy/src/redaction.ts`

## Phase 3: User Story 1 - Product/SRS Compliance Authority (Priority: P1)

**Goal**: Executable compliance matrix from product/SRS sources.

**Independent Test**: Compliance audit classifies requirements and fails release gate for partial/missing/mock/preview/doc-only status.

### Tests And Validation for User Story 1

- [x] T014 [P] [US1] Add compliance extraction contract test in `tests/contract/compliance-contract.test.ts`
- [x] T015 [P] [US1] Add source conflict precedence test in `tests/integration/compliance-source-order.test.ts`
- [x] T016 [P] [US1] Add mock-only and preview-only failure test in `tests/policy/compliance-release-gate.test.ts`

### Implementation for User Story 1

- [x] T017 [US1] Implement Product/SRS requirement extractor in `packages/core/src/readiness/compliance-extractor.ts`
- [x] T018 [US1] Implement compliance classifier and source-order resolver in `packages/core/src/readiness/compliance-service.ts`
- [x] T019 [US1] Implement compliance CLI commands in `apps/cli/src/commands/compliance.ts`
- [x] T020 [US1] Wire compliance commands in `apps/cli/src/main.ts`
- [x] T021 [US1] Add compliance API routes in `apps/server/src/routes/compliance.ts`
- [x] T022 [US1] Add cockpit compliance view in `apps/cockpit/src/routes/compliance.tsx`
- [x] T023 [US1] Add compliance export docs in `docs/operator-guide.md`

## Phase 4: User Story 2 - Packaged Local Product Install (Priority: P1)

**Goal**: One documented package/install/start path for all surfaces.

**Independent Test**: Clean checkout/package can produce usable `fulcrum`, setup, doctor, server, cockpit, TUI, MCP.

### Tests And Validation for User Story 2

- [X] T024 [P] [US2] Add package command contract test in `tests/contract/package-start-contract.test.ts`
- [X] T025 [P] [US2] Add clean install quickstart test in `tests/e2e/quickstart/product-install-readiness.sh`
- [X] T026 [P] [US2] Add loopback bind policy test in `tests/policy/package-server-bind.test.ts`

### Implementation for User Story 2

- [X] T027 [US2] Add root package bin/build/start scripts for `fulcrum` in `package.json`
- [X] T028 [US2] Add CLI packaged entrypoint build support in `apps/cli/package.json` and `apps/cli/src/main.ts`
- [X] T029 [US2] Add server command that serves cockpit assets when built in `apps/server/src/main.ts`
- [X] T030 [US2] Add install target health probes in `packages/core/src/readiness/install-targets.ts`
- [X] T031 [US2] Add package/start section to `README.md`
- [X] T032 [US2] Add package/start section to `docs/operator-guide.md`

## Phase 5: User Story 3 - SQLite Canonical State Cutover (Priority: P1)

**Goal**: SQLite is canonical; JSON is mirror/export only.

**Independent Test**: Delete JSON mirrors after restart; all state remains from SQLite.

### Tests And Validation for User Story 3

- [X] T033 [P] [US3] Add SQLite canonical restart test in `tests/recovery/sqlite-canonical-restart.test.ts`
- [X] T034 [P] [US3] Add JSON migration rollback test in `tests/recovery/json-state-migration.test.ts`
- [X] T035 [P] [US3] Add cross-surface SQLite parity test in `tests/integration/sqlite-surface-parity.test.ts`

### Implementation for User Story 3

- [X] T036 [US3] Implement JSON-to-SQLite migration service in `packages/core/src/readiness/json-state-migration.ts`
- [X] T037 [US3] Replace file work repository wiring with SQLite repositories in `apps/cli/src/work-runtime.ts`
- [X] T038 [US3] Replace file work repository wiring with SQLite repositories in `apps/server/src/runtime.ts`
- [X] T039 [US3] Replace file work repository wiring with SQLite repositories in `apps/tui/src/main.ts`
- [X] T040 [US3] Add JSON mirror rebuild command in `apps/cli/src/commands/rebuild.ts`
- [X] T041 [US3] Add SQLite corruption/missing doctor probe in `packages/core/src/doctor/setup-doctor.ts`
- [X] T042 [US3] Update backup/restore to use SQLite canonical source in `packages/core/src/recovery/backup.ts` and `packages/core/src/recovery/restore.ts`

## Phase 6: User Story 4 - Complete Doctor Capability Matrix (Priority: P1)

**Goal**: Doctor checks full SRS capability matrix.

**Independent Test**: Capability fixtures hide each tool/config and doctor reports exact state/next action.

### Tests And Validation for User Story 4

- [X] T043 [P] [US4] Add full doctor matrix contract test in `tests/contract/doctor-capability-matrix.test.ts`
- [X] T044 [P] [US4] Add PATH/env fixture integration test in `tests/integration/doctor-fixtures.test.ts`
- [X] T045 [P] [US4] Add project doctor MCP/config readiness test in `tests/integration/project-doctor-readiness.test.ts`

### Implementation for User Story 4

- [X] T046 [US4] Implement capability probe registry in `packages/core/src/doctor/capability-probes.ts`
- [X] T047 [US4] Add probes for `fd`, `ast-grep`, Aider, Repomix, memsearch, Engram, quality gates, event log, git worktree, and project configs in `packages/core/src/doctor/capability-probes.ts`
- [X] T048 [US4] Add quick/deep doctor modes in `apps/cli/src/main.ts`
- [X] T049 [US4] Add project doctor output parity in `apps/cli/src/main.ts` and `apps/server/src/routes/doctor.ts`
- [X] T050 [US4] Add cockpit doctor matrix display in `apps/cockpit/src/routes/doctor.tsx`
- [X] T051 [US4] Add doctor matrix docs in `docs/operator-guide.md`

## Phase 7: User Story 5 - Real CLI Agent Acceptance (Priority: P1)

**Goal**: Two real CLI agents plus deterministic validation complete same lifecycle or degrade explicitly.

**Independent Test**: Acceptance runs use real commands when available and guided states when unavailable.

### Tests And Validation for User Story 5

- [x] T052 [P] [US5] Add real-agent certification contract test in `tests/contract/agent-certification.test.ts`
- [x] T053 [P] [US5] Add two-real-agent acceptance test in `tests/integration/real-agent-acceptance.test.ts`
- [x] T054 [P] [US5] Add Copilot standalone rejection test in `tests/contract/copilot-standalone-cli.test.ts`

### Implementation for User Story 5

- [x] T055 [US5] Implement agent certification service in `packages/core/src/readiness/agent-certification.ts`
- [x] T056 [US5] Implement generic real-agent prompt runner in `packages/agents/src/real-agent-runner.ts`
- [x] T057 [US5] Expand Codex/Claude/Gemini/OpenCode/Aider/generic profiles in `packages/agents/src/profiles.ts`
- [x] T058 [US5] Finalize standalone Copilot profile in `packages/agents/src/copilot.ts`
- [x] T059 [US5] Add real-agent acceptance CLI in `apps/cli/src/commands/release.ts`
- [x] T060 [US5] Link real-agent evidence into run artifacts in `packages/core/src/runs/service.ts`

## Phase 8: User Story 6 - Certified Optional Adapters (Priority: P1)

**Goal**: Real optional adapters with health, install guidance, offline behavior, and certification evidence.

**Independent Test**: Enable/disable/misconfigure each adapter and verify degraded local operation.

### Tests And Validation for User Story 6

- [x] T061 [P] [US6] Add adapter certification contract test in `tests/contract/adapter-certification.test.ts`
- [x] T062 [P] [US6] Add real code tools adapter test in `tests/integration/code-tool-adapter-certification.test.ts`
- [x] T063 [P] [US6] Add memory backend adapter certification test in `tests/integration/memory-adapter-certification.test.ts`
- [x] T064 [P] [US6] Add Plane live/simulated mode boundary test in `tests/integration/plane-adapter-certification.test.ts`

### Implementation for User Story 6

- [x] T065 [US6] Implement adapter certification service in `packages/core/src/readiness/adapter-certification.ts`
- [x] T066 [US6] Add `fd`, `ast-grep`, Aider, and Repomix wrappers in `packages/code-tools/src/`
- [x] T067 [US6] Add tool version/config/hash/cache metadata in `packages/code-tools/src/cache-metadata.ts`
- [x] T068 [US6] Upgrade memsearch and Engram adapters from shells to executable probes in `packages/memory/src/`
- [x] T069 [US6] Add Plane live mode credential/connectivity certification in `packages/plane/src/plane-adapter.ts`
- [x] T070 [US6] Show adapter certification in CLI/API/cockpit via `apps/cli/src/commands/adapter.ts`, `apps/server/src/routes/adapters.ts`, and `apps/cockpit/src/routes/adapters.tsx`

## Phase 9: User Story 7 - Owned Cockpit Operations Center (Priority: P1)

**Goal**: Cockpit supports owned local workflows without external PM.

**Independent Test**: Operator completes core workflow through cockpit only.

### Tests And Validation for User Story 7

- [X] T071 [P] [US7] Add cockpit owned workflow Playwright test in `tests/e2e/cockpit-owned-workflow.spec.ts`
- [X] T072 [P] [US7] Add cockpit policy/review/merge readiness test in `tests/e2e/cockpit-review-readiness.spec.ts`
- [X] T073 [P] [US7] Add cockpit accessibility and non-color status test in `tests/e2e/cockpit-accessibility-full.spec.ts`

### Implementation for User Story 7

- [X] T074 [US7] Add cockpit task creation and transition controls in `apps/cockpit/src/routes/project-board.tsx`
- [X] T075 [US7] Add cockpit run start/cancel/tail controls in `apps/cockpit/src/routes/run-detail.tsx`
- [X] T076 [US7] Add cockpit review and merge queue route in `apps/cockpit/src/routes/review-queue.tsx`
- [X] T077 [US7] Add cockpit policy approval controls in `apps/cockpit/src/routes/policy-approvals.tsx`
- [X] T078 [US7] Add cockpit recovery/rebuild/export controls in `apps/cockpit/src/routes/recovery.tsx`
- [X] T079 [US7] Add live activity event subscription/polling parity in `apps/cockpit/src/components/live-activity.tsx`
- [X] T080 [US7] Add cockpit navigation entries for compliance and release evidence in `apps/cockpit/src/App.tsx`

## Phase 10: User Story 8 - Incremental Graph And Cache Correctness (Priority: P1)

**Goal**: Derived graph/cache data updates or marks stale on source change.

**Independent Test**: Rename/delete/change files/memory/tasks/runs and verify invalidation before rebuild.

### Tests And Validation for User Story 8

- [x] T081 [P] [US8] Add cache invalidation contract test in `tests/contract/invalidation-records.test.ts`
- [x] T082 [P] [US8] Add graph incremental correctness test in `tests/integration/graph-incremental-correctness.test.ts`
- [x] T083 [P] [US8] Add repo cache invalidation recovery test in `tests/recovery/repo-cache-invalidation.test.ts`

### Implementation for User Story 8

- [x] T084 [US8] Implement invalidation service in `packages/core/src/readiness/invalidation-service.ts`
- [x] T085 [US8] Persist invalidation records in `packages/db/src/readiness.ts`
- [x] T086 [US8] Wire invalidation into code evidence service in `packages/core/src/code/evidence-service.ts`
- [x] T087 [US8] Wire invalidation into memory service in `packages/core/src/memory/service.ts`
- [x] T088 [US8] Wire invalidation into graph service in `packages/core/src/graph/service.ts`
- [x] T089 [US8] Wire invalidation into context builder in `packages/core/src/context/builder.ts`
- [x] T090 [US8] Add graph/cache status to CLI and cockpit in `apps/cli/src/main.ts` and `apps/cockpit/src/routes/traceability.tsx`

## Phase 11: User Story 9 - Release Readiness Command And Evidence Pack (Priority: P1)

**Goal**: One command proves product readiness with evidence.

**Independent Test**: Release validation fails on any missing Product/SRS group and writes evidence pack.

### Tests And Validation for User Story 9

- [X] T091 [P] [US9] Add release readiness contract test in `tests/contract/release-readiness-contract.test.ts`
- [X] T092 [P] [US9] Add local-only release validation e2e script in `tests/e2e/quickstart/release-readiness.sh`
- [X] T093 [P] [US9] Add evidence pack redaction/privacy test in `tests/privacy/release-evidence-redaction.test.ts`

### Implementation for User Story 9

- [X] T094 [US9] Implement release validation orchestrator in `packages/core/src/readiness/release-validator.ts`
- [X] T095 [US9] Implement release CLI command in `apps/cli/src/commands/release.ts`
- [X] T096 [US9] Add release API route in `apps/server/src/routes/release.ts`
- [X] T097 [US9] Add release evidence cockpit view in `apps/cockpit/src/routes/release.tsx`
- [X] T098 [US9] Add release evidence artifact writer in `packages/core/src/readiness/evidence-writer.ts`
- [X] T099 [US9] Add final operator guide path in `docs/operator-guide.md`
- [X] T100 [US9] Add release checklist update in `docs/release-checklist.md`

## Phase 12: Polish And Cross-Cutting Validation

- [ ] T101 Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` and record output in release evidence
- [ ] T102 Run `pnpm typecheck`
- [ ] T103 Run `pnpm test`
- [ ] T104 Run `pnpm test:e2e`
- [ ] T105 Run `tests/e2e/quickstart/product-install-readiness.sh`
- [ ] T106 Run `tests/e2e/quickstart/release-readiness.sh`
- [ ] T107 Run `pnpm --filter @fulcrum/cli dev -- release validate --local-only --evidence /tmp/fulcrum-release-evidence --json`
- [ ] T108 Commit final gap-closure implementation with passing evidence

## Dependencies And Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: blocks all stories.
- **US1 Compliance**: should complete before US9 release validation, can run alongside US2-US8 after foundation.
- **US2 Install**, **US4 Doctor**, **US5 Agents**, **US6 Adapters**, **US7 Cockpit**, **US8 Graph/Cache**: can run in parallel after foundation if write scopes are coordinated.
- **US3 SQLite Cutover**: should land before final US7/US9 parity checks.
- **US9 Release Readiness**: depends on US1-US8.

### Parallel Work Guidance

- US2 owns `package.json`, `apps/cli/package.json`, server packaging docs.
- US3 owns persistence runtime wiring and migrations.
- US4 owns doctor probes.
- US5 owns agent profiles/certification.
- US6 owns adapter certification and tool wrappers.
- US7 owns cockpit workflows.
- US8 owns invalidation/graph/cache.
- US9 owns release validation orchestration and evidence.

### MVP Scope

MVP for this gap closure is US1 + US3 + US4 + US9 in local-only mode. Full readiness requires all stories.
