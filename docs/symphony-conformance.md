# Symphony Conformance Trace

Source: `vendor/openai-symphony/SPEC.md`
Lock: `.symphony-conformance.lock`

## 18.1 REQUIRED for Conformance

### Workflow path selection supports explicit runtime path and cwd default

Test ID: symphony-conformance-01

### `WORKFLOW.md` loader with YAML front matter + prompt body split

Test ID: symphony-conformance-02

### Typed config layer with defaults and `$` resolution

Test ID: symphony-conformance-03

### Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt

Test ID: symphony-conformance-04

### Polling orchestrator with single-authority mutable state

Test ID: symphony-conformance-05

### Issue tracker client with candidate fetch + state refresh + terminal fetch

Test ID: symphony-conformance-06

### Workspace manager with sanitized per-issue workspaces

Test ID: symphony-conformance-07

### Workspace lifecycle hooks (`after_create`, `before_run`, `after_run`, `before_remove`)

Test ID: symphony-conformance-08

### Hook timeout config (`hooks.timeout_ms`, default `60000`)

Test ID: symphony-conformance-09

### Coding-agent app-server subprocess client with JSON line protocol

Test ID: symphony-conformance-10

### Codex launch command config (`codex.command`, default `codex app-server`)

Test ID: symphony-conformance-11

### Strict prompt rendering with `issue` and `attempt` variables

Test ID: symphony-conformance-12

### Exponential retry queue with continuation retries after normal exit

Test ID: symphony-conformance-13

### Configurable retry backoff cap (`agent.max_retry_backoff_ms`, default 5m)

Test ID: symphony-conformance-14

### Reconciliation that stops runs on terminal/non-active tracker states

Test ID: symphony-conformance-15

### Workspace cleanup for terminal issues (startup sweep + active transition)

Test ID: symphony-conformance-16

### Structured logs with `issue_id`, `issue_identifier`, and `session_id`

Test ID: symphony-conformance-17

### Operator-visible observability (structured logs; OPTIONAL snapshot/status surface)

Test ID: symphony-conformance-18

## Function → SPEC Mapping

| File | Function | SPEC Section |
|---|---|---|
| hooks.ts | dispatchLifecycleHook | §Workspace lifecycle hooks (before_run, after_run, on_failure, on_cancel) |
| hooks.ts | HookTimeoutError | §Hook timeout config (hooks.timeout_ms, default 60000) |
| hooks.ts | resolveHookTimeoutMs | §Hook timeout config (hooks.timeout_ms, default 60000) |
| orchestrator.ts | ClaimConflictError | §Claim Lock — Unclaimed → Claimed Transition |
| orchestrator.ts | claimRun | §Claim Lock — Unclaimed → Claimed Transition |
| orchestrator.ts | dispatchRunWithHooks | §Polling orchestrator with single-authority mutable state |
| orchestrator.ts | startSymphonyOrchestrator | §Polling orchestrator with single-authority mutable state |
| prompt.ts | loadWorkflowDef | §WORKFLOW.md loader with YAML front matter + prompt body split |
| prompt.ts | parseWorkflowConfig | §Typed config layer with defaults and $ resolution |
| prompt.ts | renderPrompt | §Strict prompt rendering with issue and attempt variables |
| prompt.ts | UnknownVariableError | §Strict prompt rendering with issue and attempt variables |
| retry.ts | calcRetryDelay | §Configurable retry backoff cap (agent.max_retry_backoff_ms, default 5m) |
| retry.ts | scheduleRetry | §Exponential retry queue with continuation retries after normal exit |
| tracker.ts | buildCandidateIssuesBaseQuery | §Issue tracker client with candidate fetch + state refresh + terminal fetch |
| tracker.ts | fetchCandidateIssues | §Issue tracker client with candidate fetch + state refresh + terminal fetch |
| tracker.ts | fetchIssuesByStates | §Issue tracker client with candidate fetch + state refresh + terminal fetch |
| tracker.ts | fetchIssueStatesByIds | §Issue tracker client with candidate fetch + state refresh + terminal fetch |
| workflow-runtime.ts | createWorkflowRuntimeReloader | §Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt |
| workflow-runtime.ts | loadWorkflowRuntime | §Workflow path selection supports explicit runtime path and cwd default |
| workflow-runtime.ts | WorkflowConfigError | §Typed config layer with defaults and `$` resolution |
| workflow-runtime.ts | WorkflowFrontmatterError | §`WORKFLOW.md` loader with YAML front matter + prompt body split |
| workflow-runtime.ts | WorkflowNotFoundError | §Workflow path selection supports explicit runtime path and cwd default |
| workspace.ts | createWorkspace | §Workspace manager with sanitized per-issue workspaces |
| workspace.ts | destroyWorkspace | §Workspace cleanup for terminal issues |
| workspace.ts | getWorkspacePath | §Workspace manager with sanitized per-issue workspaces |
| workspace.ts | sanitizeWorkspaceKey | §Workspace manager with sanitized per-issue workspaces |
| workspace.ts | workspaceRoot | §Workspace manager with sanitized per-issue workspaces |

## AgentRun Orchestration State Trace

Source: `vendor/openai-symphony/SPEC.md` section 7.1 Issue Orchestration States and section 7.2 Run Attempt Lifecycle.

| Fulcrum `agent_runs.orchestration_state` | Symphony source | Notes |
|---|---|---|
| `unclaimed` | section 7.1 `Unclaimed` | Issue is not running and no retry is scheduled. |
| `claimed` | section 7.1 `Claimed` | Orchestrator reserved the task; `agent_runs_claimed_task_id_check` requires `task_id` to avoid duplicate claimed rows with `NULL` task IDs. |
| `running` | section 7.1 `Running` | Worker task exists and the run is tracked as active. |
| `retry_queued` | section 7.1 `RetryQueued` | Worker is idle while a retry timer exists. |
| `released` | section 7.1 `Released` | Claim removed because the tracker state is terminal, inactive, missing, or retry path completed without redispatch. |
| `succeeded` | section 7.2 `Succeeded` | Terminal run-attempt reason after worker success. |
| `failed` | section 7.2 `Failed` | Terminal run-attempt reason after worker failure. |
| `timed_out` | section 7.2 `TimedOut` | Terminal run-attempt reason after timeout handling. |
| `stalled` | section 7.2 `Stalled` | Terminal run-attempt reason after stall reconciliation. |
| `cancelled` | section 7.2 `CanceledByReconciliation` | Fulcrum spelling uses D1 lowercase snake-case; maps to Symphony's reconciliation cancellation terminal reason. |

## Approval/Sandbox Posture (D-09)

Fulcrum implements the following defaults per SPEC §5.3.6 and §1 (implementation-defined posture):

| Field | Default | Notes |
|---|---|---|
| `codex.command` | `codex app-server` | Shell command launched via `bash -lc` in the per-issue workspace. |
| `codex.approval_policy` | `auto` (implementation-defined) | No interactive approval required by default; agents run autonomously. Operators override via `WORKFLOW.md` `codex.approval_policy`. |
| `codex.thread_sandbox` | `noSandbox` (host mode) | Default is host-trust mode with an explicit trust-boundary warning on startup. Operators configure Docker/Podman/Vercel/Daytona/Modal/E2B via feature flags. |
| `codex.turn_sandbox_policy` | implementation-defined | Pass-through to app-server; not enforced by Fulcrum orchestrator. |
| `noSandbox` host boundary | Trust warning emitted | `src/orchestration/sandbox-runner.ts` emits a visible warning when `noSandbox` is the effective provider, reminding operators that agent commands run with host OS access. |
