# Symphony Conformance Trace

Source: `vendor/openai-symphony/SPEC.md`
Lock: `.symphony-spec.lock`

## 18.1 REQUIRED for Conformance

### Workflow path selection supports explicit runtime path and cwd default

### `WORKFLOW.md` loader with YAML front matter + prompt body split

Workflow definition load: `src/orchestration/symphony/prompt.ts:loadWorkflowDef` reads `workflow_definitions` through MikroORM and resolves project-specific `WORKFLOW.md` first, then the org-wide default (`project_id = NULL`) when no project row exists.

### Typed config layer with defaults and `$` resolution

Config validation: `src/orchestration/symphony/prompt.ts:parseWorkflowConfig` parses YAML front matter and Zod-validates `stall_timeout_ms`, `max_retry_backoff_ms`, `keepOnFailure`, and `maxAttempts`, returning defaults for omitted values.

### Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt

### Polling orchestrator with single-authority mutable state

### Issue tracker client with candidate fetch + state refresh + terminal fetch

Candidate fetch + SPEC ordering: `src/orchestration/symphony/tracker.ts:fetchCandidateIssues` uses Fulcrum PGlite `tasks` as canonical tracker, filters `status="ready"`, excludes unresolved blockers + `agent_runs.orchestration_state="claimed"`, orders `priority ASC`, `created_at ASC`, then `id ASC` as Fulcrum identifier tie-breaker.

State batch fetch: `src/orchestration/symphony/tracker.ts:fetchIssuesByStates` validates state input/output with Zod, reads `agent_runs` via MikroORM repository `find({ org, orchestrationState: { $in: states } }, { limit, populate: ["task"] })`, returns full run rows + task row summary, and short-circuits empty state lists.

State refresh fetch: `src/orchestration/symphony/tracker.ts:fetchIssueStatesByIds` validates id input/output with Zod, short-circuits empty id lists, and uses lightweight repository `find({ id: { $in: runIds }, org }, { fields: ["id", "orchestrationState"] })` to return slim `{id,state}` rows for polling while omitting unknown ids.

### Workspace manager with sanitized per-issue workspaces

Naming invariant: `src/orchestration/symphony/workspace.ts:sanitizeWorkspaceKey` strips every char outside `[A-Za-z0-9._-]`, appends `_<taskId[0..7]>` when an existing key collides, and truncates final keys to 128 chars.

Create-on-claim: `src/orchestration/symphony/workspace.ts:createWorkspace` creates `$FULCRUM_WORKSPACE_ROOT/<orgId>/<sanitizedKey>` (default `~/.fulcrum/workspaces`) and persists `agent_runs.workspace_path`.

Destroy-on-release: `src/orchestration/symphony/workspace.ts:destroyWorkspace` removes the workspace and clears `agent_runs.workspace_path`; `keepOnFailure=true` retains failed-run workspaces for inspection.

### Workspace lifecycle hooks (`before_run`, `after_run`, `on_failure`, `on_cancel`)

Hook dispatch: `src/orchestration/symphony/hooks.ts:dispatchLifecycleHook` invokes typed TS lifecycle hooks with `{ run, task, workspacePath, attempt }`, emits `events` rows with `verb='hook_dispatched'` and payload `{hookName,durationMs}`, and calls the Pillar 8 context assembler boundary for `before_run` through an injected `ContextAssembler` interface.

Orchestrator integration: `src/orchestration/symphony/orchestrator.ts:dispatchRunWithHooks` runs `before_run → agent dispatch → after_run` on success, dispatches `on_failure` when agent dispatch throws, and dispatches `on_cancel` for abort-style cancellation errors.

### Hook timeout config (`before_run_timeout_ms`, `after_run_timeout_ms`, `on_failure_timeout_ms`, `on_cancel_timeout_ms`; default `60000`)

Timeout enforcement: `src/orchestration/symphony/hooks.ts:dispatchLifecycleHook` resolves per-hook timeout overrides, uses `AbortSignal.timeout(timeoutMs)` inside `Promise.race`, and rejects breaches as `HookTimeoutError`.

### Coding-agent app-server subprocess client with JSON line protocol

### Codex launch command config (`codex.command`, default `codex app-server`)

### Strict prompt rendering with `issue` and `attempt` variables

Prompt template: `src/orchestration/symphony/prompt.ts:renderPrompt` renders Liquid templates with `strictVariables: true` and `strictFilters: true`, exposing only `{ issue, attempt }`; unknown variables are rethrown as `UnknownVariableError`.

### Exponential retry queue with continuation retries after normal exit

### Configurable retry backoff cap (`agent.max_retry_backoff_ms`, default 5m)

### Reconciliation that stops runs on terminal/non-active tracker states

### Workspace cleanup for terminal issues (startup sweep + active transition)

### Structured logs with `issue_id`, `issue_identifier`, and `session_id`

### Operator-visible observability (structured logs; OPTIONAL snapshot/status surface)

## §Claim Lock — Unclaimed → Claimed Transition

Mapping: `src/orchestration/symphony/orchestrator.ts:claimRun`

| Requirement | Implementation |
|---|---|
| Atomic state transition `unclaimed → claimed` | `agentRunRepo.nativeUpdate({ org, task: taskId, orchestrationState: 'unclaimed' }, { orchestrationState: 'claimed', claimedBy: instanceId })` — single UPDATE WHERE clause; if 0 rows affected → `ClaimConflictError` |
| No double-dispatch | `agent_runs_claimed_unique` partial unique index on `(task_id) WHERE orchestration_state='claimed'` acts as DB-level guard; nativeUpdate WHERE filter is the primary synchronization primitive |
| Events row on success | `eventsRepo.create({ org, subjectKind: 'agent_run', subjectId: claimed.id, verb: 'state_changed', payload: { from: 'unclaimed', to: 'claimed' } })` + `fork.flush()` |
| Internal tRPC surface | `orchestration.claimRun` mutation in `src/trpc/routers/orchestration.ts`; maps `ClaimConflictError → TRPCError(CONFLICT)` |
| Poll-loop callable | `claimRun(em, orgId, taskId, instanceId)` signature ready for Pillar 3 slice 10 orchestrator poll loop |

## AgentRun Orchestration State Trace

Source: `vendor/openai-symphony/SPEC.md` section 7.1 Issue Orchestration States and section 7.2 Run Attempt Lifecycle.

| Fulcrum `agent_runs.orchestration_state` | Symphony source | Notes |
|---|---|---|
| `unclaimed` | section 7.1 `Unclaimed` | Not running, no retry scheduled. |
| `claimed` | section 7.1 `Claimed` | Orchestrator reserved task; `agent_runs_claimed_task_id_check` requires `task_id` → avoid duplicate claimed rows w/ `NULL` task IDs. |
| `running` | section 7.1 `Running` | Worker task exists, run tracked active. |
| `retry_queued` | section 7.1 `RetryQueued` | Worker idle, retry timer exists. |
| `released` | section 7.1 `Released` | Claim removed — tracker state terminal, inactive, missing, or retry path done w/o redispatch. |
| `succeeded` | section 7.2 `Succeeded` | Terminal run-attempt reason after worker success. |
| `failed` | section 7.2 `Failed` | Terminal run-attempt reason after worker failure. |
| `timed_out` | section 7.2 `TimedOut` | Terminal run-attempt reason after timeout handling. |
| `stalled` | section 7.2 `Stalled` | Terminal run-attempt reason after stall reconciliation. |
| `cancelled` | section 7.2 `CanceledByReconciliation` | Fulcrum spelling = D1 lowercase snake-case; maps → Symphony reconciliation cancellation terminal reason. |
