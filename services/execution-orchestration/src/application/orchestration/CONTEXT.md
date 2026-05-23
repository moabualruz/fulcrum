# Orchestration

> Application-layer commands, queries, and dispatch tracing for the coordinator face of execution-orchestration: state-machine mutations on `AgentRun` rows, dashboard reads, and pre-launch trace assembly. Parent `services/execution-orchestration/CONTEXT.md` owns the domain vocabulary; this sub-area adds the verbs and read models used to drive it.

## Language

**ClaimRunState**:
The transactional command that flips one `unclaimed` `AgentRun` to `claimed` for a `Worker` instance, verifying the row read-side because PGlite under-reports affected counts.
_Avoid_: Acquire, lock, take.

**RetryStateTransition**:
The command that advances a failed `AgentRun` to its next `OrchestrationState` using the `RecoveryDecision` outputs (`nextState`, `nextAttempt`, `nextRetryAt`, `lastErrorKind`, `exhausted`) within one SQL statement.
_Avoid_: Reschedule, backoff write.

**OrchestrationStateMutationConflict**:
The error thrown when a claim or retry transition finds no row in the expected pre-state, signalling another `Worker` won the race.
_Avoid_: Lock conflict, stale write.

**OrchestrationConfig**:
The per-`Org` row holding `pollIntervalS`, `maxConcurrency`, `stallTimeoutS`, and `workspaceRoot`; upserted by `upsertOrchestrationConfig` and read into the dashboard status header.
_Avoid_: Settings, tuning.

**WorkflowDef**:
The persisted, optionally project-scoped record of a YAML workflow plus its prompt template; upserted by id and listed for the workflow picker.
_Avoid_: Template, recipe, playbook.

**OrchestrationDashboard**:
The read model assembled by `loadOrchestrationDashboard`: a status header, the 50 most recent `DispatchRow` entries, and the 10 most recent failed `RetryQueueRow` entries.
_Avoid_: Overview, panel.

**DispatchRow**:
One projection row over `agent_runs` joined to `tasks`, exposing `agent`, `status`, `orchestration_state`, `claimed_by`, `started_at`, and `project_id` for the dashboard table.
_Avoid_: Run row, list item.

**RetryQueueRow**:
A dashboard projection of failed runs (`last_error_kind`, `retry_count`, `started_at`) used to render the retry queue panel.
_Avoid_: Failed list, backlog.

**OrchestrationStatus**:
The header summary (`lastTickAt`, `workerConnected`, `concurrencyUsed`, `concurrencyMax`, `lastSyncDate`) derived from `OrchestrationConfig` and a count of `running` runs.
_Avoid_: Health, heartbeat.

**DispatchTrace**:
The pre-launch bundle returned by `buildDispatchTrace`: resolved `taskId`/`projectId`/`repoId`, context source refs, the routing choice, and the resolved `ToolAuthorityTrace`. Inputs are validated; missing project or repo throws `AppValidationError`.
_Avoid_: Dispatch payload, launch plan, preflight.

**DispatchTrustMode**:
The four-valued trust ladder (`manual`, `assisted`, `trusted`, `full-auto`) flowing through `DispatchTrace.authority`. Distinct from `ToolPermissionMode`, which is the wire-level project policy mapped onto it.
_Avoid_: Trust level, automation level.

## Relationships

- One **OrchestrationApplicationContext** scopes every command and query to one `Org` (and optionally one `Project`).
- One **ClaimRunState** call consumes one `unclaimed` **AgentRun** and emits one `state_changed` **Event**; on miss it raises **OrchestrationStateMutationConflict**.
- One **RetryStateTransition** advances one **AgentRun** and emits one `state_changed` **Event**; when `exhausted`, it also writes terminal `status = failed`.
- One **OrchestrationDashboard** is composed from one **OrchestrationConfig**, many **DispatchRow** entries, and many **RetryQueueRow** entries.
- One **DispatchTrace** is assembled from one `Task`, one `Project` policy (mapped to **DispatchTrustMode**), one context preview, and the requested or default `actionAgent`.
- Many **WorkflowDef** rows belong to one `Org`; each may be scoped to one `Project`.

## Example dialogue

> **Dev:** "If two **Workers** call **ClaimRunState** for the same task, what do they see?"
> **Domain expert:** "One wins and gets a `runId`; the other gets an **OrchestrationStateMutationConflict** because the post-update verify read finds no row in `claimed` state for it. The losing worker is expected to poll again."
> **Dev:** "And the dashboard — does it read the same row mid-transition?"
> **Domain expert:** "Yes. **OrchestrationDashboard** is an eventually-consistent read; it surfaces whatever **OrchestrationState** the row currently holds. The `state_changed` **Event** is the audit trail, not the dashboard source."

## Flagged ambiguities

- **"Status" on DispatchRow vs OrchestrationState** — `DispatchRow.status` mirrors the legacy `agent_runs.status` column for back-compat; `orchestration_state` is the authoritative coordinator state. New UI should branch on `orchestration_state`.
- **DispatchTrustMode vs ToolPermissionMode** — `DispatchTrustMode` is the four-valued ladder used inside dispatch trace assembly. `ToolPermissionMode` is the project-policy wire format mapped onto it via `trustModeFromToolPermissionMode`. They are not interchangeable; conversion is explicit.
- **`symphony_state` column in DispatchRow** — selected as `NULL::text` placeholder. The historical Symphony state field is no longer populated; do not read from it in new code (parent CONTEXT flags Symphony as an implementation codename).
- **"Retry" vs "Recovery"** — this sub-area uses `transitionRunForRetry` and `RetryQueueRow` for SQL/UI ergonomics, but the domain concept is **RecoveryDecision** (parent CONTEXT). New names should prefer the parent term.
