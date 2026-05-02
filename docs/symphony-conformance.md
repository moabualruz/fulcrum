# Symphony Conformance Trace

Source: `vendor/openai-symphony/SPEC.md`
Lock: `.symphony-spec.lock`

## 18.1 REQUIRED for Conformance

### Workflow path selection supports explicit runtime path and cwd default

### `WORKFLOW.md` loader with YAML front matter + prompt body split

### Typed config layer with defaults and `$` resolution

### Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt

### Polling orchestrator with single-authority mutable state

### Issue tracker client with candidate fetch + state refresh + terminal fetch

Candidate fetch + SPEC ordering: `src/orchestration/symphony/tracker.ts:fetchCandidateIssues` uses Fulcrum PGlite `tasks` as canonical tracker, filters `status="ready"`, excludes unresolved blockers + `agent_runs.orchestration_state="claimed"`, orders `priority ASC`, `created_at ASC`, then `id ASC` as Fulcrum identifier tie-breaker.

State batch fetch: `src/orchestration/symphony/tracker.ts:fetchIssuesByStates` validates state input/output with Zod, reads `agent_runs` via MikroORM repository `find({ org, orchestrationState: { $in: states } }, { limit, populate: ["task"] })`, returns full run rows + task row summary, and short-circuits empty state lists.

State refresh fetch: `src/orchestration/symphony/tracker.ts:fetchIssueStatesByIds` validates id input/output with Zod, short-circuits empty id lists, and uses lightweight repository `find({ id: { $in: runIds }, org }, { fields: ["id", "orchestrationState"] })` to return slim `{id,state}` rows for polling while omitting unknown ids.

### Workspace manager with sanitized per-issue workspaces

### Workspace lifecycle hooks (`after_create`, `before_run`, `after_run`, `before_remove`)

### Hook timeout config (`hooks.timeout_ms`, default `60000`)

### Coding-agent app-server subprocess client with JSON line protocol

### Codex launch command config (`codex.command`, default `codex app-server`)

### Strict prompt rendering with `issue` and `attempt` variables

### Exponential retry queue with continuation retries after normal exit

### Configurable retry backoff cap (`agent.max_retry_backoff_ms`, default 5m)

### Reconciliation that stops runs on terminal/non-active tracker states

### Workspace cleanup for terminal issues (startup sweep + active transition)

### Structured logs with `issue_id`, `issue_identifier`, and `session_id`

### Operator-visible observability (structured logs; OPTIONAL snapshot/status surface)

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
