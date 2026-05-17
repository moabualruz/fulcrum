# Context: Execution Orchestration

> The bounded service that owns *how work gets executed by agents*: dispatching agent runs, routing tasks to the right agent, sandboxing the run, and harvesting the resulting artifacts. Sister services (`work-management`, `knowledge-workspace`, `workflow-coordination`) own the *what*; this service owns the *how* and *with which agent*.

## Language

**AgentRun**:
One end-to-end execution of a single agent against a single task, with its own workspace, transcript, and lifecycle state.
_Avoid_: Job, session, invocation, execution.

**Attempt**:
One iteration of an `AgentRun` from workspace prep through terminal exit; an `AgentRun` may have several `Attempts` driven by recovery retries.
_Avoid_: Try, retry, pass.

**OrchestrationState**:
The coordinator-facing lifecycle stage of an `AgentRun` (`unclaimed`, `claimed`, `running`, `retry_queued`, `released`, `succeeded`, `failed`, `timed_out`, `stalled`, `cancelled`).
_Avoid_: Status, phase.

**AttemptLifecycleState**:
The internal stage of the *current* `Attempt` (`preparing_workspace`, `building_prompt`, `launching_agent_process`, `initializing_session`, `streaming_turn`, `finishing`, terminal). Distinct from `OrchestrationState`.
_Avoid_: Step, stage.

**Worker**:
The host process that claims unclaimed `AgentRun` rows, advances them through their lifecycle, and releases them on shutdown. Identified by `claimedBy`.
_Avoid_: Runner, executor, daemon.

**AgentProfile**:
Per-org configuration record describing how to launch one CLI agent: `cliPath`, `defaultFlags`, `authEnvVars`, `maxIterations`, `defaultTimeout`, `skillFolder`.
_Avoid_: Agent config, runner config.

**RoutingRule**:
A persisted JSON-rules-engine predicate over `TaskFacts` that, when matched, selects an `actionAgent` and `actionSkillSet`. Has `priority`, `enabled`, `source` (`manual` | `learned` | `imported`).
_Avoid_: Policy, route, assignment rule.

**RoutingDecision**:
The output of evaluating active `RoutingRules` against `TaskFacts`: which rule matched, which agent was chosen, with what confidence and source. Recorded as a routing event for telemetry.
_Avoid_: Match, verdict, selection.

**TaskFacts**:
The denormalized fact bundle (`task.kind`, `priority`, `tags`, `title`, …) fed to the rules engine. The contract surface between `work-management` and routing.
_Avoid_: Task data, payload.

**Sandbox**:
The isolation boundary an `AgentRun` executes inside: `host`, `docker`, or `podman`. Owns the workspace path and any FS/network constraints.
_Avoid_: Container, jail.

**Workspace**:
The on-disk working tree (`workspacePath`) the sandbox mounts and the agent edits during a run. Diffed at the end into `workspaceDiffPath`.
_Avoid_: Checkout, sandbox dir.

**Transcript**:
The captured stdout/stderr/event stream of one `AgentRun`, persisted at `transcriptPath`. Truncation is tracked via `transcriptTruncated`.
_Avoid_: Log, output, history.

**Artifact**:
A file harvested out of the `Workspace` at run end (filename, path, mime, sha256, optional retention). Belongs to exactly one `AgentRun` and optionally one `Task`.
_Avoid_: Output, file, asset.

**RecoveryDecision**:
The retry verdict computed for a failed `AgentRun`: `shouldRetry`, `exhausted`, jittered exponential `delayMs`, `nextRecoveryAt`. Caps at `MAX_RECOVERY_RETRIES` = 3.
_Avoid_: Backoff, requeue.

**Symphony**:
The internal codename for the agent-runtime orchestrator under `infrastructure/agent-runtime/symphony/` that drives the app-server protocol, dispatch, tracker, telemetry, and worker loop. Implementation detail, not domain vocabulary.
_Avoid_: Using as a domain term in new APIs.

## Relationships

- One **Org** has many **AgentRuns**, **RoutingRules**, **AgentProfiles**, and **Artifacts** (every row is org-scoped via `org_id`).
- One **Task** (owned by `work-management`) has zero-or-more **AgentRuns**; an **AgentRun** in `claimed` state must reference a `Task`.
- One **AgentRun** has many **Attempts**, exactly one current **AttemptLifecycleState**, exactly one **OrchestrationState**, exactly one **Transcript**, and many **Artifacts**.
- A **Worker** claims many **AgentRuns** over its lifetime; one **AgentRun** is claimed by at most one **Worker** at a time (`claimedBy`).
- One **AgentRun** runs inside exactly one **Sandbox** (`sandboxMode`) with exactly one **Workspace** (`workspacePath`).
- One **AgentProfile** describes one CLI agent for one **Org**; many **AgentRuns** are launched against the same **AgentProfile**.
- A **RoutingDecision** is produced by evaluating active **RoutingRules** against **TaskFacts**; it selects the `actionAgent` used to spawn an **AgentRun**.
- A failed **AgentRun** produces one **RecoveryDecision** per failure; an exhausted **RecoveryDecision** transitions it to terminal `failed`.
- **Artifacts** and cross-domain pointers (run → task, run → doc) flow through **Edge** rows for the relationship graph.

## Example dialogue

> **Dev:** "When the router picks an agent for a **Task**, do we create the **AgentRun** immediately or wait for a **Worker** to claim it?"
> **Domain expert:** "The **RoutingDecision** writes an `unclaimed` **AgentRun** row. A **Worker** then claims it, which transitions the **OrchestrationState** to `claimed` and starts the first **Attempt** in `preparing_workspace`."
> **Dev:** "And if that **Attempt** times out?"
> **Domain expert:** "The **RecoveryDecision** decides. If `shouldRetry` is true, the **OrchestrationState** goes to `retry_queued` with `nextRetryAt` set; if `exhausted`, it goes to terminal `failed` and the **Transcript** and **Artifacts** harvested so far are kept."

## Flagged ambiguities

- **"Run" vs "Session" vs "Invocation"** — all three appear in upstream agent CLIs and prior PRDs. Resolved: the persisted unit is **AgentRun**. "Session" (`sessionId`, `threadId`, `turnId` on `AgentRun`) is the *agent CLI's* internal handle for resume, not the domain concept. "Invocation" is not used.
- **"Status" vs "OrchestrationState" vs "AttemptLifecycleState"** — `AgentRun.status` is a free-form legacy string kept for back-compat; the authoritative coordinator state is **OrchestrationState** and the authoritative inner-loop state is **AttemptLifecycleState**. Do not branch on `status` in new code.
- **"Agent" the registry entry vs "Agent" the routed target** — the `agents` context (`src/agents/`) owns the five-entry CLI registry (`claude-code`, `codex`, …). This service's `actionAgent` and `AgentProfile.name` are *instances* configured per-org against that registry. Different layer, same word; do not conflate.
- **"Sandbox" the service folder vs "Sandbox" the isolation mode** — the entity folder `infrastructure/database/entities/sandbox/` groups `AgentProfile`, `Artifact`, `Edge` (historical "Sandcastle" grouping). The domain term **Sandbox** refers to the run's isolation mode (`host` | `docker` | `podman`). The folder name is legacy and is not the domain concept.
- **"Symphony"** is an implementation codename inside `infrastructure/agent-runtime/`, not a domain term. Do not surface it in public APIs, DTOs, or new docs.
