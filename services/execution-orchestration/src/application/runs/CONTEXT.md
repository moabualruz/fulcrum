# Runs

> Application-layer module that turns `AgentRun` rows into the read/write DTOs the HTTP, tRPC, CLI, and TUI surfaces consume. Owns dispatch commands, the run list/detail queries, and the observability bundle assembled at detail time.

## Language

**RunDto**:
The list-level projection of an `AgentRun` (id, orgId, projectId, agentName, status, prompt, createdAt).
_Avoid_: RunSummary, RunListItem.

**RunDetailDto**:
The detail-level projection that extends `RunDto` with lifecycle timestamps, transcript/diff paths, attempt counters, and an embedded `RunObservability`.
_Avoid_: RunFull, RunView.

**RunObservability**:
The per-run telemetry bundle (`context` source refs, `artifacts`, `audit` events, `recovery` retry state) assembled at detail time for inspection surfaces.
_Avoid_: RunTelemetry, RunDiagnostics.

**ApprovalQueueItem**:
A pending risky-tool prompt derived from `approval.requested`/`approval.required` events minus matching `approval.decision` events for one run.
_Avoid_: PendingApproval, ApprovalRequest.

**RunRow**:
The flattened SQL row returned by `listRunRows`/`listProjectRuns` for tabular listings, including denormalized `task_title`, `sandbox_mode`, and `recent_events`.
_Avoid_: RunRecord, RunListRow.

**RunsPageData**:
The composite payload (`runs` + `projects` + `tasks` option lists) used to hydrate the runs index surface in a single round-trip.
_Avoid_: RunsIndexData, RunsScreen.

**RunRowsFilter**:
The shape of optional filters accepted by `listRunRows` (`projectId`, `agent`, `status`, `range`, `dateFrom`, `dateTo`).
_Avoid_: RunQuery, RunSearch.

**DispatchRunInput**:
The minimal command input for `dispatchRun` (`agentName`, optional `prompt`); contrast with `dispatchTaskRun` which additionally binds a `taskId`.
_Avoid_: NewRunInput, CreateRunDto.

## Relationships

- One **AgentRun** projects to exactly one **RunDto** and at most one **RunDetailDto**.
- One **RunDetailDto** embeds exactly one **RunObservability**; the observability bundle aggregates `artifacts` and `audit` events filtered to that run.
- One **RunDetailDto** (and the project run page payload) carries zero-or-more **ApprovalQueueItems** derived from its audit event stream.
- One **RunsPageData** carries many **RunRows** plus the **ProjectOption** and **TaskOption** lists imported from `work-management`.
- A **DispatchRunInput** produces one `unclaimed` **AgentRun**; `dispatchTaskRun` additionally enqueues an `agent-runs` job and appends a `dispatched` event.

## Example dialogue

> **Dev:** "Why does the runs page need both `RunRow` and `RunDto`?"
> **Domain expert:** "`RunDto` is the canonical projection for the HTTP/tRPC list endpoint. `RunRow` is the schema-tolerant SQL flattening used by table surfaces that need `task_title`, `sandbox_mode`, and `recent_events` denormalized in one query."
> **Dev:** "And the approval items on the detail view?"
> **Domain expert:** "`ApprovalQueueItem` is derived inside the queries module from the run's audit events. It's a read model — the wire request lives in the agent-client-protocol context."

## Flagged ambiguities

- **`RunRow` vs `ProjectRunRow` vs `AgentRunDetailRow`** — three SQL row shapes coexist. `RunRow` powers the global runs index, `ProjectRunRow` powers the per-project list, `AgentRunDetailRow` powers the project run detail page. Do not merge; each is shaped to its consumer.
- **`prompt` field semantics** — `RunDto.prompt` is sourced from `AgentRun.threadId` for legacy reasons; it is not the rendered prompt. The rendered prompt surfaces as `RunDetailDto.renderedPrompt` (currently `null`, reserved for future hydration).
- **`status` vs `state`** — `RunDto.status` carries the legacy free-form string; `RunDetailDto.state` and `orchestrationState` carry the authoritative `OrchestrationState`. New surfaces should branch on `state`.
