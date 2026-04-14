# Round 5 — Big Rocks (Nothing Deferred)

> **Scope change**: prior rounds deferred H-1..H-5, J-6, J-7, K-5 as "big rocks needing their own plan". User directive: address them now. This round closes all of them.

**Goal**: Ship the multi-agent execution layer (runner + worker + worktree git + merge queue + step handlers), wire telemetry through it, add OTel exporter, and expand the CLI. After Round 5, nothing in the gap-analysis history remains deferred.

## Task dependency graph

```
H-3 (worktree git subprocess)
    │
    └──> H-4 (merge queue actually merges, using H-3's worktree)
              │
              ├──> H-1+H-5 (workflow runner + 16 step handlers, where one
              │             step type is spawn_agent → calls H-2, another
              │             is run_script / git_merge → uses H-3+H-4)
              │
              │
H-2 (worker / agent executor) ──┘
              │
              └──> K-5 (telemetry call sites — instrument the runner,
                        worker, janitor, MCP handlers)

Independent:
  J-7 (OTel exporter) — wrap core/telemetry with an opt-in OTLP sink
  J-6 (CLI coverage)  — 10 new subcommands, no code dependency on the above
```

## Execution order

1. **H-3** — Worktree git subprocess (S/M)
2. **H-4** — Merge queue executes `git merge`, conflict detection (M)
3. **H-2** — Worker / agent executor with pluggable adapter (M/L)
4. **H-1 + H-5** — Workflow runner + 16 step handlers (L — biggest task)
5. **K-5** — Span call sites wrapped around runner / worker / janitor (S)
6. **J-7** — OTel exporter (S/M)
7. **J-6** — CLI coverage: 10 new subcommand groups (L)

## Design decisions (made here so subagents don't have to)

### H-3 worktree git subprocess

- **Path strategy**: `<project_root>/.fulcrum-worktrees/<worktree_id>` (per-project, not global)
- **Branch naming**: `fulcrum/<agent_role>/<worktree_id_suffix>`
- **Git CLI**: `child_process.execFileSync('git', ['worktree', 'add', path, '-b', branch, base])` — use `execFile` not `exec` for arg safety
- **Non-git fallback**: if the project has no `.git`, mark `write_mode='sequential'` in the projects table and skip `git worktree add`; the worktree row still gets created with `path=<project_root>` and a sequential lock acquired on the whole project
- **Rollback**: if `git worktree add` fails, delete the DB row and return the error
- **.gitignore**: add `.fulcrum-worktrees/` to the root `.gitignore` automatically (idempotent) so the worktree dir never gets committed
- **Tests**: use a temp dir + `git init` inside each test; don't mock git

### H-4 merge queue

- **Trigger**: `processMergeQueue({ workspace_id, actor_role })` — called from janitor cycle AND from CLI/MCP
- **Ordering**: FIFO by `updated_at` — oldest-ready-first
- **Artifact gates**:
  - A `review_summary` artifact with `status='approved'` must exist for the worktree
  - A `test_run_summary` artifact with `status='passed'` must exist for the worktree
  - If either is missing or not in the required status, skip the worktree (leave it in `ready_for_merge`) and log a policy_event
- **Merge**: `git merge --no-ff <branch> -m "Merge <role>/<worktree_id>: <goal>"` executed in `<project_root>`
- **Conflict detection**: exit code 1 AND stderr contains `CONFLICT`/`Automatic merge failed`
- **On conflict**: set worktree status to `conflict`, run `git merge --abort`, create a `merge_conflict_report` artifact with the diff, emit `handoff_created` to the integration_worker, don't auto-retry
- **On success**: set worktree status to `merged`, run `git worktree remove`, emit `worktree_merged` event
- **Policy**: only `canMerge(role)` may execute — reuse Round 2 H-11 capability lookup

### H-2 worker / agent executor

Full subprocess execution of other agent CLIs isn't testable in isolation. The solution is a **pluggable adapter**:

- **New package**: `packages/worker/` with `src/{index,adapter,lifecycle,stub}.ts`
- **`AgentAdapter` interface**: `{ name: string; spawn(ctx: SpawnContext): Promise<WorkerResult> }`
- **Built-in adapters**:
  - `stub` — reads canned responses from `FULCRUM_AGENT_STUB_DIR` env var (one file per `run_id`). Default in tests.
  - `subprocess` — generic `execFile` wrapper that runs a user-supplied command + parses JSON stdout. Opt-in via env var.
- **`registerAgentAdapter(name, adapter)`** — extension point for userland to plug in a real Claude/Gemini/PI adapter
- **Lifecycle**: `spawnAgent({ role, model, handoff, worktree_path })` → creates agent_run row via `startAgentRun`, invokes adapter, streams progress via `heartbeatAgentRun`, resolves with `completeAgentRun` or `blockAgentRun`
- **Policy check**: before spawn, calls `require(action='spawn_agent', actor_role=caller_role, ...)` — only L1 may invoke team members per §4
- **Tests**: use `stub` adapter with canned responses; verify heartbeats + completion are persisted

### H-1 workflow runner + H-5 step handlers

- **New file**: `packages/workflows/src/runner.ts` with `runWorkflow(workflow_id)` top-level driver
- **New file**: `packages/workflows/src/step-executor.ts` with 16 step handlers dispatched by `step.type`
- **Loop**: `while (status==='active') { ready = nextReadySteps(); for each ready: await executeStep(); }`
- **Per-step timeout**: default 600s (reuse `DEFAULT_HEARTBEAT_TIMEOUT_SEC` from constants), configurable via `step.timeout_sec`
- **Retries**: default 3, exponential backoff (1s, 2s, 4s)
- **State persistence**: every step transition updates `workflow_step_states.status` + `attempts` + `error`
- **Span instrumentation**: `runWorkflow` wraps in a root span, each `executeStep` in a child span
- **16 step types**:
  1. `create_task` — call `createTask()`
  2. `create_issue` — call planning `createIssue`
  3. `create_epic` — call planning `createEpic`
  4. `write_artifact` — insert into `artifacts` table
  5. `write_memory` — call `writeMemory()`
  6. `invoke_team` — call `invokeTeam()` (policy-checked)
  7. `spawn_agent` — call `spawnAgent()` from H-2
  8. `run_script` — execFile with a scripts/ allowlist (policy-checked)
  9. `call_mcp_tool` — invoke an MCP tool handler directly
  10. `wait_for_task` — block step until task.status matches
  11. `wait_for_review` — block until review row exists with status
  12. `wait_for_artifact` — block until artifact exists
  13. `branch` — set `status=completed` or `skipped` based on a predicate
  14. `loop` — re-add step to the ready queue with incremented iteration count
  15. `halt` — set workflow status to `completed`
  16. `escalate` — create a handoff to `chief_of_staff`
- **Tests**: a small end-to-end test that runs a workflow with `{ type: create_task }, { type: write_memory }, { type: halt }` and verifies the DB state

### K-5 telemetry call sites

- Wrap `runWorkflow` in `startSpan('workflow.run', { workflow_id })`
- Wrap each `executeStep` in `startSpan('workflow.step', { type, step_id }, parent=workflow_span_id)`
- Wrap `spawnAgent` in `startSpan('agent.run', { role, model })`
- Wrap janitor cycle in `startSpan('janitor.cycle')`
- Wrap MCP `handleToolCall` in `startSpan('mcp.tool', { tool_name })`

### J-7 OTel exporter

- **Opt-in**: only active when `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` is set
- **Dep**: add `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http` to `packages/core/package.json`
- **Wire**: in `packages/core/src/telemetry/otel.ts` — `initOtel()` called from `serve startup` (CLI), sets up a tracer. `startSpan` dually writes to the DB (existing behavior) and the OTel SDK if initialized.
- **Semantic conventions**: map span name + payload to `gen_ai.*` attributes where applicable (`gen_ai.system=fulcrum`, `gen_ai.agent.name=<role>`, `gen_ai.usage.input_tokens` from payload)

### J-6 CLI coverage

- 10 new top-level groups: `task`, `issue`, `epic`, `board`, `queue`, `sync`, `team`, `workflow`, `agent`, `run`
- Each supports `list / create / get / update` where applicable
- Output format: table by default, `--json` for JSON
- All delegate to core functions — no duplicated logic

## Not in scope for Round 5

- Real Claude/Gemini/PI adapter implementations beyond the stub (users plug in their own via `registerAgentAdapter`)
- OpenTelemetry metrics or logs SDK (traces only)
- Full Plane adapter sync execution (sync scaffold stays as-is; Round 2 flagged Plane as its own thing)
- UI / web dashboard

## Success criteria

- All existing 932 tests still green
- New tests for each task (estimated +200-300 tests total)
- Every deferred item from phase-1/2/3/4 validated docs now has a closing commit
- Next fresh review (Round 6) finds nothing that isn't an intentional design choice

## Execution

Sequential subagent dispatch in the order: H-3 → H-4 → H-2 → H-1+H-5 → K-5 → J-7 → J-6. Each subagent gets a scoped prompt with only the relevant files + a commit message template.
