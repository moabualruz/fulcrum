---
description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include tests or validation tasks required by the feature specification and Fulcrum Constitution. Policy, privacy/no-network, provenance, recovery, adapter degradation, worktree safety, doctor, and quickstart gates are required when the story touches those surfaces.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **CLI**: `apps/cli/`
- **Local API/MCP server**: `apps/server/`
- **Cockpit UI**: `apps/cockpit/`
- **Core domain services**: `packages/core/`
- **SQLite schema and persistence**: `packages/db/`
- **MCP tools/resources**: `packages/mcp/`
- **Adapters**: `packages/plane/`, `packages/memory/`, `packages/code-tools/`, `packages/agents/`
- **Shared schemas and contracts**: `packages/shared/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/policy/`, `tests/privacy/`, `tests/recovery/`, `tests/unit/`
- Adjust paths only if plan.md documents a different real repository layout.

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Define or update SQLite schema and migrations in packages/db/
- [ ] T005 [P] Define shared TypeScript schemas/events/IDs in packages/shared/
- [ ] T006 [P] Implement core service interfaces in packages/core/
- [ ] T007 Add adapter interface and health/degraded-state contract for affected integrations
- [ ] T008 Add policy gate plumbing for dangerous or externally visible actions
- [ ] T009 Configure redaction, ignore rules, and local-only defaults
- [ ] T010 Add doctor/health checks for new capability and degraded states
- [ ] T011 Add error handling and structured JSON/JSONL output paths

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests And Validation for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [P] [US1] Contract test for [schema/API/MCP tool] in tests/contract/[name].test.ts
- [ ] T013 [P] [US1] Integration test for [operator journey] in tests/integration/[name].test.ts
- [ ] T014 [P] [US1] Policy/privacy/provenance validation in tests/[policy|privacy|integration]/[name].test.ts

### Implementation for User Story 1

- [ ] T015 [P] [US1] Create or update [Entity1] schema/model in packages/shared/ and packages/db/
- [ ] T016 [P] [US1] Create or update [Entity2] schema/model in packages/shared/ and packages/db/
- [ ] T017 [US1] Implement core service in packages/core/ (depends on T015, T016)
- [ ] T018 [US1] Implement CLI/API/MCP/cockpit surface in apps/ or packages/mcp/
- [ ] T019 [US1] Add validation, redaction, degraded-state, and error handling
- [ ] T020 [US1] Add provenance/evidence fields and artifact/event capture
- [ ] T021 [US1] Add doctor and quickstart updates for user story 1 behavior

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests And Validation for User Story 2

- [ ] T022 [P] [US2] Contract test for [schema/API/MCP tool] in tests/contract/[name].test.ts
- [ ] T023 [P] [US2] Integration test for [operator journey] in tests/integration/[name].test.ts
- [ ] T024 [P] [US2] Policy/privacy/provenance validation in tests/[policy|privacy|integration]/[name].test.ts

### Implementation for User Story 2

- [ ] T025 [P] [US2] Create or update [Entity] schema/model in packages/shared/ and packages/db/
- [ ] T026 [US2] Implement core service in packages/core/
- [ ] T027 [US2] Implement CLI/API/MCP/cockpit surface in apps/ or packages/mcp/
- [ ] T028 [US2] Integrate with User Story 1 components (if needed)
- [ ] T029 [US2] Add doctor/degraded-state and provenance updates

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests And Validation for User Story 3

- [ ] T030 [P] [US3] Contract test for [schema/API/MCP tool] in tests/contract/[name].test.ts
- [ ] T031 [P] [US3] Integration test for [operator journey] in tests/integration/[name].test.ts
- [ ] T032 [P] [US3] Policy/privacy/provenance validation in tests/[policy|privacy|integration]/[name].test.ts

### Implementation for User Story 3

- [ ] T033 [P] [US3] Create or update [Entity] schema/model in packages/shared/ and packages/db/
- [ ] T034 [US3] Implement core service in packages/core/
- [ ] T035 [US3] Implement CLI/API/MCP/cockpit surface in apps/ or packages/mcp/
- [ ] T036 [US3] Add doctor/degraded-state and provenance updates

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit tests (if requested) in tests/unit/
- [ ] TXXX Security hardening
- [ ] TXXX Privacy/no-network verification
- [ ] TXXX Provenance/evidence review
- [ ] TXXX Adapter health and disablement verification
- [ ] TXXX Backup/restore or recovery verification
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Contract test for [schema/API/MCP tool] in tests/contract/[name].test.ts"
Task: "Integration test for [operator journey] in tests/integration/[name].test.ts"
Task: "Policy/privacy/provenance validation in tests/[policy|privacy|integration]/[name].test.ts"

# Launch all models for User Story 1 together:
Task: "Create or update [Entity1] schema/model in packages/shared/ and packages/db/"
Task: "Create or update [Entity2] schema/model in packages/shared/ and packages/db/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
