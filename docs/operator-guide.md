# Fulcrum Operator Guide

Source of truth: `SRS.md`, `SRS-ammend-01.md`, `SRS-ammend-02.md`, and `specs/004-fulcrum-cli-agent-os-delivery/spec.md`. `SRS-ammend-02.md` wins when language/runtime direction conflicts.

## Install And Readiness

Source checkout prerequisites:

- Node.js 22-compatible runtime.
- pnpm 10.x for workspace install and dev commands.
- git for repository registration, code search context, and worktree workflows.
- Optional Playwright browser dependencies for release/e2e validation.

1. Preview setup before mutation:
   `fulcrum setup preview`
2. Apply approved local setup:
   `fulcrum setup apply`
3. Check local readiness:
   `fulcrum doctor`
4. Check automation parity:
   `fulcrum doctor --json --no-network`

Setup must show local state paths, proposed config changes, required and optional capabilities, privacy defaults, and approvals. It must not edit shell profiles, install privileged dependencies, start remote services, or mutate global host state without explicit operator approval. Doctor classifies capabilities as `managed`, `detected`, `guided`, `optional`, `blocked`, `degraded`, `disabled`, or `unknown`, with blocking status, freshness, privacy status, and exact next action.

For this repository checkout, run the apps directly with pnpm:

```sh
pnpm --filter @fulcrum/cli dev -- --help
pnpm --filter @fulcrum/server dev
pnpm --filter @fulcrum/cockpit dev
pnpm --filter @fulcrum/tui dev
pnpm --filter @fulcrum/cli dev -- mcp stdio
```

Evidence: FR-001 through FR-006, SC-001, SC-006, `contracts/cli-contract.md`, and `tests/contract/cli-setup-doctor.test.ts`.

## Projects And Cockpit

Register each local repository:

```sh
fulcrum project add /path/to/repo
fulcrum project list
fulcrum project show <projectId>
fulcrum project doctor <projectId>
```

Project records include stable ID, root path, default branch, ignored-path policy, worktree policy, quality gates, privacy mode, health state, adapters, task counts, run counts, review queue, and degraded capabilities. Cockpit reads same canonical records as CLI and MCP. Cross-surface disagreement is a defect unless stale, partial, or degraded state is explicit.

Evidence: FR-007 through FR-010, FR-074, FR-081, SC-012, SC-019, SC-020, and `tests/integration/project-cockpit-parity.test.ts`.

## Tasks, Runs, And Evidence

Create and supervise work:

```sh
fulcrum task create --project <projectId> --title "<title>"
fulcrum task show <taskId>
fulcrum run start <taskId> --agent <agentName>
fulcrum run status <runId>
fulcrum run tail <runId>
fulcrum run summarize <runId>
fulcrum run complete <runId>
```

Task transitions follow SRS lifecycle rules. Runs include task ID, project ID, agent, command identity, worktree, context pack, event stream, artifacts, gates, policy decisions, heartbeat, summary, failure reason, and final outcome. Cancellation and crash handling preserve logs, artifacts, dirty state, and exactly one terminal state.

Evidence: FR-011 through FR-026, SC-004, SC-016, SC-018, `tests/contract/run-lifecycle.test.ts`, and `tests/integration/validation-agent-run.test.ts`.

## Context, Code, Memory, And Artifacts

Build inspectable context:

```sh
fulcrum context build <taskId> --offline --format markdown
fulcrum context show <contextPackId>
fulcrum context explain <contextPackId>
fulcrum code search --project <projectId> "<query>"
fulcrum memory search --project <projectId> "<query>"
fulcrum artifact attach --run <runId> --type <type> --summary "<summary>" --local-ref <path>
```

Context packs must show lanes, included items, omitted items, source refs, freshness, evidence type, inclusion reason, limitations, degraded lanes, budget behavior, and redaction status. Exact code evidence must distinguish exact/path/structural sources from semantic or broad repo-pack evidence. Permanent memory writeback remains draft until policy and operator approval allow it.

Evidence: FR-027 through FR-049, SC-007 through SC-009, SC-015, `tests/integration/context-provenance.test.ts`, `tests/integration/code-search-exact.test.ts`, and `tests/integration/memory-backends.test.ts`.

## MCP And Machine Interfaces

Default MCP transport is stdio. Loopback HTTP is local-only unless policy approves non-loopback bind.

```sh
fulcrum mcp stdio
```

Canonical MCP tool names include `fulcrum_doctor_status`, `fulcrum_project_list`, `fulcrum_task_get`, `fulcrum_task_claim`, `fulcrum_task_update_status`, `fulcrum_task_list`, `fulcrum_run_start`, `fulcrum_run_heartbeat`, `fulcrum_run_event`, `fulcrum_run_complete`, `fulcrum_context_build`, `fulcrum_context_get`, `fulcrum_context_explain`, `fulcrum_memory_search`, `fulcrum_memory_add`, `fulcrum_code_search`, `fulcrum_repo_map_get`, `fulcrum_repomix_pack`, `fulcrum_worktree_allocate`, `fulcrum_worktree_status`, `fulcrum_artifact_attach`, `fulcrum_quality_gate_run`, and `fulcrum_policy_check`.

Every MCP call records local call evidence: tool name, caller when known, run ID when known, parameter hash, redacted parameters, result summary, timestamp, redaction status, and linked policy decisions. MCP tools cannot bypass policy gates.

Evidence: FR-026, FR-074, SC-012, SC-022, `contracts/mcp-tool-contract.md`, and `docs/mcp-local.md`.

## Adapters

Adapters cover external PM/Plane, memory backends, code tools, semantic retrieval, CLI agents, telemetry/exporters, observability, and remote providers. Optional means health-checked, replaceable, disableable, visibly degraded, and bounded by ownership/privacy rules. Missing optional adapters must preserve local workflows with actionable degraded or disabled state.

Plane writeback and other external actions require preview and approval. Local-only mode blocks remote PM, remote model/provider, telemetry, remote observability, and public-bind actions unless operator changes policy.

Evidence: FR-050 through FR-060, SC-017, `contracts/adapter-contract.md`, `tests/integration/adapter-degradation.test.ts`, and `tests/integration/pm-adapter-degraded.test.ts`.

## Policy

Default policy denies or requires approval for destructive, externally visible, permanent-memory, public-bind, arbitrary-shell, remote-provider, sensitive-export, backup-purge, cleanup, reset, uninstall, and disabled-adapter actions. `--yes` can skip only non-policy confirmations. It must not bypass required approvals.

Use:

```sh
fulcrum policy check --action <action> --subject-type <type> --subject <id>
fulcrum policy approve <policyDecisionId>
```

Policy records must include action type, requester, subject, reason, scope, decision, bypass if any, and linked task/run/artifact when available.

Evidence: FR-058 through FR-064, FR-084 through FR-086, SC-003, SC-015, and `tests/policy/policy-matrix.test.ts`.

## Worktrees

Worktree allocation happens before supervised agent work unless policy approves an existing workspace. Delivery review shows dirty state, untracked files, uncommitted changes, unpushed commits, conflicts, artifacts, gates, and merge readiness.

Cleanup is blocked when dirty files, untracked files, uncommitted changes, unpushed commits, conflicts, active runs, missing required artifacts, or missing approval exist.

Evidence: FR-052 through FR-057, SC-010, `tests/integration/worktree-cleanup-block.test.ts`, and `tests/recovery/worktree-unsafe-states.test.ts`.

## Quality Gates

Quality gates are readiness authority. Required gates block writeback, review completion, merge readiness, and completion claims until passing evidence exists. Operator exceptions are audited separately and do not count as passing readiness.

Use:

```sh
fulcrum gate list --project <projectId>
fulcrum gate run <gateId> --cwd <repoPath> --project <projectId> --task <taskId> --run <runId>
```

Gate evidence includes command name, working context, start/end time, duration, status, output refs, parsed summary, linked task/run, and redaction status.

Evidence: FR-065 through FR-070, SC-011, `tests/integration/quality-gate-runner.test.ts`, and `tests/policy/quality-required-blocks.test.ts`.

## Recovery

Local ownership requires visible backup, restore, export, rebuild, reset, uninstall, and purge behavior.

```sh
fulcrum backup create
fulcrum backup restore <backupId>
fulcrum restore <backupId>
fulcrum export --format jsonl
fulcrum rebuild projections
fulcrum repair
fulcrum uninstall preview
```

Backups preserve canonical state, config, artifacts, logs, managed memory, context packs, and restorable manifest. Restore validates references. Rebuild regenerates derived indexes and marks unavailable source systems degraded. Reset/uninstall previews removals and preserves backups unless purge is explicitly approved.

Evidence: FR-071 through FR-073, FR-087 through FR-090, SC-013, SC-014, and `tests/recovery/release-recovery-gates.test.ts`.
