# Fulcrum Release Checklist

Release readiness requires executed evidence, not documentation-only claims. Source requirements: `SRS.md`, `SRS-ammend-01.md`, `SRS-ammend-02.md`, `FULCRUM_PRODUCT.md`, and `specs/004-fulcrum-cli-agent-os-delivery/spec.md`.

## Success Criteria Evidence Matrix

| Criterion | Required evidence                                                                                                             | Current evidence target                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001    | Clean-machine setup preview, approved setup, project registration, and doctor under 15 minutes with no cloud account          | `tests/e2e/quickstart/full-operator-validation.sh`, `tests/integration/setup-doctor-flow.test.ts`                                                           |
| SC-002    | Local-only no-network task, context, deterministic run, artifacts, quality gate, cockpit, TUI, CLI                            | `tests/privacy/local-only-product-flow.test.ts`, `tests/integration/tui-surface-parity.test.ts`                                                             |
| SC-003    | All dangerous actions denied or approval-required by default                                                                  | `tests/policy/constitution-dangerous-actions.test.ts`, `tests/policy/policy-matrix.test.ts`                                                                 |
| SC-004    | Run terminal-state uniqueness and event preservation for complete/fail/cancel/crash                                           | `tests/contract/run-lifecycle.test.ts`, `tests/recovery/run-stale-crash.test.ts`                                                                            |
| SC-005    | 95% common status operations under 1 second on registered project cache                                                       | `tests/integration/status-performance.test.ts`                                                                                                              |
| SC-006    | Doctor quick checks under 3 seconds with next actions                                                                         | `tests/contract/cli-setup-doctor.test.ts`, `tests/integration/setup-doctor-flow.test.ts`                                                                    |
| SC-007    | Context provenance for every item plus degraded lanes, omissions, freshness, evidence type                                    | `tests/integration/provenance-completeness.test.ts`, `tests/integration/context-provenance.test.ts`                                                         |
| SC-008    | Code search source refs, evidence type, ignored-path behavior, freshness                                                      | `tests/contract/code-search.test.ts`, `tests/privacy/code-search-ignore.test.ts`                                                                            |
| SC-009    | Approved memory writeback cites source or declares missing provenance                                                         | `tests/policy/memory-approval.test.ts`, `tests/integration/memory-backends.test.ts`                                                                         |
| SC-010    | Unsafe worktree cleanup blocked                                                                                               | `tests/integration/worktree-cleanup-block.test.ts`, `tests/recovery/worktree-unsafe-states.test.ts`                                                         |
| SC-011    | Required gates block readiness/writeback/merge/completion until passing evidence                                              | `tests/policy/quality-required-blocks.test.ts`, `tests/integration/quality-gate-runner.test.ts`                                                             |
| SC-012    | Cockpit, CLI, JSON/JSONL, MCP, and health parity for IDs/status/degraded state                                                | `tests/integration/cross-surface-parity.test.ts`, `tests/integration/mcp-surface-parity.test.ts`                                                            |
| SC-013    | Backup/restore recovers required canonical refs                                                                               | `tests/recovery/backup-restore.test.ts`, `tests/recovery/release-recovery-gates.test.ts`                                                                    |
| SC-014    | Rebuild regenerates derived data or marks unavailable sources degraded                                                        | `tests/recovery/rebuild-derived-data.test.ts`, `tests/recovery/graph-rebuild.test.ts`                                                                       |
| SC-015    | Secret redaction masks known sensitive values in outputs/writebacks                                                           | `tests/privacy/secret-redaction.test.ts`, `tests/privacy/quality-output-redaction.test.ts`                                                                  |
| SC-016    | Two real CLI agents plus deterministic validation agent complete same lifecycle                                               | `tests/integration/two-agent-lifecycle.test.ts`, `tests/integration/validation-agent-run.test.ts`                                                           |
| SC-017    | Optional integration outages degrade visibly and preserve local workflows                                                     | `tests/integration/adapter-degradation.test.ts`, `tests/integration/pm-adapter-degraded.test.ts`, `tests/privacy/observability-disabled-by-default.test.ts` |
| SC-018    | Operator can identify task, context, changed files/artifacts, gates, policy decisions, next action in release review          | `tests/e2e/release-acceptance-operator-review.spec.ts`                                                                                                      |
| SC-019    | Cross-surface consistency with 25 projects, 1,000 tasks, 10,000 events, 500 artifacts, 100 memory entries                     | `tests/fixtures/scale/`, `tests/integration/cross-surface-parity.test.ts`                                                                                   |
| SC-020    | Primary cockpit workflows keyboard-completable with non-color-only status                                                     | `tests/e2e/cockpit-accessibility.spec.ts`, `tests/e2e/cockpit-project-board.spec.ts`                                                                        |
| SC-021    | TUI dashboard/projects/tasks/runs/worktrees/artifacts/context/gates/doctor/events match other surfaces                        | `tests/integration/tui-surface-parity.test.ts`                                                                                                              |
| SC-022    | Every SRS CLI command group and MCP tool has contract, schema, core path, policy behavior, structured error, release evidence | `tests/contract/cli-full-srs-commands.test.ts`, `tests/contract/mcp-full-srs-tools.test.ts`                                                                 |

## SRS CLI Coverage

Each command group requires contract coverage, shared schema, implementation path, policy behavior, structured errors, human output, JSON output, and release evidence:

- setup: `setup preview`, `setup apply`, compatibility aliases `setup:preview`, `setup:apply`
- doctor/readiness: `doctor`, `project doctor`, `plane doctor`
- repair/uninstall: `repair`, `uninstall`, `uninstall preview`
- project: `project add`, `project register` compatibility alias, `project list`, `project show`, `project doctor`, `project config`
- external PM/Plane: `plane connect`, `plane import`, `plane sync`, `plane link-task`, `plane writeback`
- task: `task create`, `task list`, `task show`, `task claim`, `task status`, `task assign`, `task transition`
- context: `context build`, `context show`, `context explain`, `context export`
- code: `code search`, `code files`, `code structural`, `code repomap refresh`, `code repomap show`, `code repomix build`, `code repomix show`
- memory: `memory import`, `memory add`, `memory search`, `memory approve`, `memory writeback`, `memory stale`, `memory open`, `memory export`
- run: `run start`, `run status`, `run cancel`, `run tail`, `run summarize`, `run complete`
- worktree: `worktree allocate`, `worktree status`, `worktree diff`, `worktree cleanup`
- gate: `gate define`, `gate list`, `gate run`, `gate results`, `gate readiness`, contract target `gate show`
- artifact: `artifact attach`, `artifact show`, `artifact list`
- backup/restore/export/rebuild/reset: `backup create`, `backup list`, `backup restore`, `restore`, `export`, `rebuild projections`, `rebuild memory-index`, `rebuild code-cache`, `reset preview`, `uninstall preview`

Evidence target: `tests/contract/cli-full-srs-commands.test.ts` plus command-specific tests already listed in `specs/004-fulcrum-cli-agent-os-delivery/tasks.md`.

## SRS MCP Coverage

Each MCP tool requires canonical name or documented alias, input/output schema, shared core-service path, policy behavior, structured error mapping, call logging, and release evidence:

- `fulcrum_doctor_status`
- `fulcrum_project_list`
- `fulcrum_task_get`
- `fulcrum_task_claim`
- `fulcrum_task_update_status`
- `fulcrum_task_list`
- `fulcrum_run_start`
- `fulcrum_run_heartbeat`
- `fulcrum_run_event`
- `fulcrum_run_complete`
- `fulcrum_context_build`
- `fulcrum_context_get`
- `fulcrum_context_explain`
- `fulcrum_memory_search`
- `fulcrum_memory_add`
- `fulcrum_code_search`
- `fulcrum_repo_map_get`
- `fulcrum_repomix_pack`
- `fulcrum_worktree_allocate`
- `fulcrum_worktree_status`
- `fulcrum_artifact_attach`
- `fulcrum_quality_gate_run`
- `fulcrum_policy_check`

Resources requiring parity evidence: `fulcrum://projects/{projectId}`, `fulcrum://tasks/{taskId}`, `fulcrum://runs/{runId}`, `fulcrum://context-packs/{contextPackId}`, `fulcrum://artifacts/{artifactId}`, `fulcrum://doctor`, and `fulcrum://mcp-call-log`.

Evidence target: `tests/contract/mcp-full-srs-tools.test.ts`, `tests/contract/mcp-tools.test.ts`, `tests/integration/mcp-surface-parity.test.ts`, and local call-log assertions.

## Release Gate

Release cannot pass when any matrix row lacks executed evidence, when a criterion is satisfied only by preview/stub/sample behavior, or when CLI, cockpit, TUI, MCP, JSON/JSONL, health reports, and exports disagree without explicit stale/partial/degraded marking.
