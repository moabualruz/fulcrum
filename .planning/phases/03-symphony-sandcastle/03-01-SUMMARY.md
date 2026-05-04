---
phase: "03"
plan: "01"
subsystem: orchestration/symphony
tags: [symphony, workflow-runtime, conformance, tdd]
dependency_graph:
  requires: []
  provides:
    - workflow-runtime loader (loadWorkflowRuntime)
    - reload last-good manager (createWorkflowRuntimeReloader)
    - typed error hierarchy (WorkflowNotFoundError, WorkflowFrontmatterError, WorkflowConfigError)
    - updated conformance trace with workflow-runtime mappings and approval/sandbox posture section
  affects:
    - src/orchestration/symphony/workflow-runtime.ts (created)
    - src/orchestration/__tests__/symphony-conformance.test.ts (extended)
    - scripts/gen-conformance-trace.ts (extended)
    - docs/symphony-conformance.md (regenerated)
    - .symphony-conformance.lock (regenerated)
tech_stack:
  added:
    - node:fs/promises readFile for runtime WORKFLOW.md loading
  patterns:
    - RED-first TDD per plan type:tdd requirement
    - typed error hierarchy with kind discriminant for safe error handling
    - zod schema for typed front matter config with defaults
    - last-good reload pattern (immutable lastGood, atomic swap on valid reload)
    - $VAR expansion at single tested resolver (WorkflowConfigError on missing)
    - ~ expansion for path values using explicit homeDir parameter
key_files:
  created:
    - src/orchestration/symphony/workflow-runtime.ts
  modified:
    - src/orchestration/__tests__/symphony-conformance.test.ts
    - scripts/gen-conformance-trace.ts
    - docs/symphony-conformance.md
    - .symphony-conformance.lock
decisions:
  - codex.command defaults to "codex app-server" per SPEC §5.3.6
  - $VAR expansion happens only in designated string fields (tracker.api_key, workspace.root); missing var fails with WorkflowConfigError
  - ~ expansion uses explicit homeDir parameter (not process.env.HOME) for testability
  - Reload uses try/catch around loadWorkflowRuntime; error shape exposes message+kind+workflowPath
  - restartRequired flag attached to runtime object when server.port changes across reload
  - WorkflowRawConfigSchema uses .passthrough() to preserve unknown keys for forward compatibility
  - Front matter scanner: file must start with exactly "---"; no closing delimiter treated as no front matter
metrics:
  duration: ~25 minutes
  completed: "2026-05-04"
  tasks_completed: 4
  files_changed: 5
---

# Phase 03 Plan 01: Workflow Runtime and Conformance Harness Summary

**One-liner:** Filesystem `WORKFLOW.md` runtime loader with strict YAML/body split, typed $VAR/~ expansion, `codex app-server` defaults, reload last-good, and generated conformance trace extended with workflow-runtime mappings and approval/sandbox posture documentation.

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 03-01-01 | RED | Add failing tests for SYM-01/02/03/04/14/21/24/26 to conformance suite | 1a7ed5a3 |
| 03-01-02 | GREEN | Implement `workflow-runtime.ts` with loader, typed config, env expansion | e474922c |
| 03-01-03 | GREEN | Implement `createWorkflowRuntimeReloader` with last-good reload support | e474922c |
| 03-01-04 | execute | Update gen-conformance-trace.ts, regenerate docs + lock | c1f90fea |

## Requirements Addressed

- **SYM-01**: Explicit `workflowPath` wins over `${cwd}/WORKFLOW.md` default — tested and implemented.
- **SYM-02**: Missing default WORKFLOW.md throws `WorkflowNotFoundError`; invalid reload preserves lastGood.
- **SYM-03**: YAML front matter / Markdown body split correctly; invalid YAML and non-map front matter throw `WorkflowFrontmatterError`.
- **SYM-04**: Non-map YAML front matter (arrays, scalars) throws `WorkflowFrontmatterError`.
- **SYM-14**: `codex.command` defaults to `"codex app-server"`.
- **SYM-21**: `$VAR` env resolution and `~` home expansion in tracker.api_key and workspace.root.
- **SYM-24**: Missing `$VAR` reference throws `WorkflowConfigError`.
- **SYM-26**: Unknown prompt variables throw `UnknownVariableError` (tested via existing strict Liquid renderer).

## Deviations from Plan

None — plan executed exactly as written. Tasks 02 and 03 were implemented in a single file and committed together since `createWorkflowRuntimeReloader` is a natural extension of `loadWorkflowRuntime` sharing all the same types.

## Known Issues (Pre-existing, Out of Scope)

**web:check OOM**: `svelte-check` crashes with JavaScript heap out-of-memory on this machine regardless of changes in this plan. Confirmed pre-existing by stashing changes and reproducing. Documented to `deferred-items.md` is not required since this is machine-level infrastructure, not code.

## Threat Surface Scan

No new network endpoints, auth paths, or DB schema changes introduced. `workflow-runtime.ts` reads from the filesystem only. The `$VAR` resolver fails closed on missing values (T-03-02 mitigation applied). Front matter is strictly validated via Zod schemas (T-03-01 mitigation applied).

## Self-Check

- [x] `src/orchestration/symphony/workflow-runtime.ts` — created and exports `loadWorkflowRuntime`, `createWorkflowRuntimeReloader`, `WorkflowNotFoundError`, `WorkflowFrontmatterError`, `WorkflowConfigError`
- [x] `src/orchestration/__tests__/symphony-conformance.test.ts` — contains all required error classes and test strings
- [x] `docs/symphony-conformance.md` — contains "Workflow path selection...", "Dynamic `WORKFLOW.md` watch/reload/re-apply", "Codex launch command config"
- [x] `scripts/ci.ts` — contains `symphony:conformance` (pre-existing, confirmed)
- [x] 33 tests pass in conformance suite (was 17 before this plan)
- [x] CI overall exit code 0 (web:check OOM is pre-existing machine issue, not caused by this plan)
