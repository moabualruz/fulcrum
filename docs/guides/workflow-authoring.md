# Workflow Authoring

> Declarative step graphs with 29 built-in handlers, retry semantics, and automatic span instrumentation.

Fulcrum workflows are small, resumable, DAG-shaped recipes for multi-agent work. You describe them as a list of typed steps with dependencies; the runner walks the DAG, retries on failure, writes state on every transition, and emits OpenTelemetry spans. This guide covers the runner contract, every step handler, and a working end-to-end example.

---

## The workflow runner

The runner lives in `packages/workflows/src/runner.ts`. Its public entry point is:

```typescript
import { runWorkflow } from '@fulcrum/workflows'

const result = await runWorkflow({
  wf_id:         'wf_abc',
  workspace_id:  'ws_1',
  max_iterations:       1000,      // safety cap
  default_timeout_ms:   600_000,   // per-step timeout
  default_max_retries:  3,         // per-step retries
})
// → { wf_id, final_status: 'completed' | 'blocked' | 'failed', steps_executed, duration_ms }
```

Given a `wf_id`, the runner:

1. Loads the run + step definitions from the `workflow_runs.steps` JSON blob.
2. Opens a root `workflow.run` span.
3. In a bounded loop, calls `nextReadySteps(states, defs)` from `engine.ts` to find DAG nodes whose dependencies have all completed.
4. For each ready step it opens a child `workflow.step` span, calls `executeStep(ctx)` under a timeout, persists the new state back to the row, and chooses retry / skip / advance / halt based on the `StepResult`.
5. Terminates with `completed`, `blocked`, or `failed` — see [error handling](#error-handling).

The runner is **bounded**. Three safety caps stop infinite loops:

- `max_iterations` (default `1000`) caps the total outer-loop passes.
- `default_timeout_ms` (default `600_000`) wraps every handler call in `Promise.race`.
- A stall detector breaks the loop when every ready step in a pass returned `skipped` and nothing is retrying.

State is persisted **after every transition**, not just at the end. If the process dies mid-run, calling `runWorkflow` again with the same `wf_id` resumes from the last recorded state.

---

## Step handlers

All 29 handlers are registered in `packages/workflows/src/step-executor.ts`. Every handler reads from `ctx.step.config`, optionally touches the DB or another Fulcrum package, and returns a `StepResult`.

```typescript
type StepResult =
  | { status: 'completed'; output?: unknown }
  | { status: 'skipped';   error?: string }   // not ready, try again next pass
  | { status: 'failed';    error?: string }   // runner retries, then halts
```

### Core

| Step type | Blocking? | Config | Output | Notes |
|-----------|-----------|--------|--------|-------|
| `create_task` | no | `{title, description?, priority?}` | `{task_id, display_id}` | Requires `ctx.project_id` |
| `create_issue` | no | `{title, description?}` | `{issue_id}` | via `@fulcrum/planning` |
| `create_epic` | no | `{title, description?}` | `{epic_id}` | via `@fulcrum/planning` |

### Memory

| Step type | Blocking? | Config | Output |
|-----------|-----------|--------|--------|
| `write_memory` | no | `{content, kind?, scope?}` | `{memory_id}` |
| `read_memory` | no | `{query, limit?}` | `{count, memories}` |

Defaults: `kind='fact'`, `scope='project'`, `limit=10`.

### Artifacts

| Step type | Blocking? | Config | Output |
|-----------|-----------|--------|--------|
| `write_artifact` | no | `{artifact_type?, title?, file_path?, owner_type?, owner_id?}` | `{artifact_id, display_id}` |
| `read_artifact` | no | `{artifact_id}` | `{artifact: row}` |
| `review_artifact` | no | `{target_id, summary?}` | `{review_id}` |

`write_artifact` defaults: `artifact_type='research_note'`, `file_path='workflow/<wf_id>/<step_id>.md'`, owner defaults to the workflow itself. New artifacts start in `status='draft'`.

### Control flow

| Step type | Blocking? | Config | Behaviour |
|-----------|-----------|--------|-----------|
| `branch` | no | `{output_key, expected}` | Dotted-path lookup into `ctx.outputs`; returns `completed` on match, `skipped` otherwise |
| `loop` | yes | `{iterations}` | Returns `skipped` until `ctx.attempts+1 >= iterations`, then `completed` |
| `halt` | terminal | `{}` | Returns `{halt: true}` — runner short-circuits and marks the run `completed` |
| `escalate` | no | `{goal, task_type?, from_agent_id?, handoff_inputs?}` | Creates a handoff to `chief_of_staff` via `createHandoff`, returns `{handoff_id}` |
| `prompt_user` | no (in runner) | `{}` | Runner returns `completed` immediately; interactive prompting happens in `stepWorkflow` |

The `branch` predicate uses dotted-path lookup: `output_key: 's1.result.status'` drills into `ctx.outputs.s1.result.status`.

### Async gates

These are the "wait until X happens" steps. They return `skipped` when the gate hasn't fired yet, which causes the runner to break out of the loop (no progress) and mark the run `blocked`. When the external event fires and someone calls `runWorkflow` again, the gate's next invocation returns `completed` and the DAG advances.

| Step type | Config | Unblocks when |
|-----------|--------|---------------|
| `wait_for_task` | `{task_id, status?}` | `tasks.status == status` (default `'done'`) |
| `wait_for_review` | `{target_id}` | Most recent `reviews` row for `target_id` has `status='approved'` |
| `wait_for_artifact` | `{owner_id, artifact_type}` | Any row exists in `artifacts` with matching `owner_id` + `artifact_type` |

### Agents

| Step type | Blocking? | Config | Output |
|-----------|-----------|--------|--------|
| `spawn_agent` | yes (adapter runs inline) | `{target_role, caller_role?, task_id, model?, adapter?}` | `{run_id, summary}` on `completed`; returns `failed` otherwise |
| `invoke_team` | no | `{template_id, purpose?, goal?, caller_role?, caller_agent_id?, task_id?}` | `{instance_id}` |

Both go through the usual policy gate (`canInvokeTeams`). See [worker-adapters](./worker-adapters.md) for adapter wiring.

### Scripts and tools

| Step type | Blocking? | Config | Notes |
|-----------|-----------|--------|-------|
| `run_script` | yes | `{script}` | Allowlist: `run_tests`, `lint`, `typecheck`, `build`. Runs `npm run <script>` via `execFile` and captures the first 4000 chars of stdout |
| `call_mcp_tool` | no | `{tool_name, args}` | Currently **stubbed** — records the intent and returns a no-op success so workflows referencing MCP tools don't fail. Full MCP wiring lands in a later round |

### Introspection

| Step type | Blocking? | Config | Output |
|-----------|-----------|--------|--------|
| `read_project` | no | `{}` | `{project: row}` |
| `evaluate_policy` | no | `{rule, subject}` | `{policy: result}` — lazy-imports `checkPolicy` from `@fulcrum/core` |
| `gate` | no | `{open: boolean}` | Returns `completed` when `open !== false`, otherwise `skipped` |
| `validate_schema` | no | `{schema}` | **Stubbed** — returns `{validated: true}` |

### Advanced / stubbed

| Step type | Notes |
|-----------|-------|
| `parallel` | Parent node for fan-out; returns `{parallel: true}` immediately. The DAG does the real fan-out via `depends_on` edges |
| `complete` | Returns `{complete: true}` — useful as an explicit terminal marker |
| `run_tool` | **Stubbed** — placeholder for generic tool runs |
| `search_code` | **Stubbed** — placeholder for a future code-search adapter |
| `search_web` | **Stubbed** — placeholder for a future web-search adapter |

---

## A concrete example: `implement_feature`

Here's a 5-step workflow that shows every category working together. It takes a seed task, runs the software engineer through `spawn_agent`, waits for a review to be approved, stores the outcome in memory, and halts.

```typescript
import {
  registry,
  runWorkflow,
  type WorkflowDefinition,
} from '@fulcrum/workflows'
import { startWorkflow } from '@fulcrum/workflows'

const implementFeature: WorkflowDefinition = {
  name: 'implement_feature',
  version: '1.0',
  description: 'Break down a goal, run software_engineer, wait for review, record outcome',
  steps: [
    {
      step_id: 's1_plan',
      step_type: 'create_task',
      name: 'Create the implementation task',
      config: {
        title: 'Implement feature X',
        description: 'Auto-generated by implement_feature workflow',
        priority: 'high',
      },
      max_retries: 2,
      timeout_ms: 30_000,
    },
    {
      step_id: 's2_engineer',
      step_type: 'spawn_agent',
      name: 'Run software_engineer on the new task',
      config: {
        target_role: 'software_engineer',
        caller_role: 'chief_of_staff',
        // The task_id is threaded in by the caller via a prior step or
        // the inputs bag; in this example we assume the runner writes
        // s1_plan.output.task_id into config at start time.
        task_id: '${s1_plan.task_id}',
        adapter: 'stub',
      },
      depends_on: ['s1_plan'],
      timeout_ms: 300_000,
    },
    {
      step_id: 's3_review',
      step_type: 'wait_for_review',
      name: 'Block until a reviewer approves the work',
      config: {
        target_id: '${s1_plan.task_id}',
      },
      depends_on: ['s2_engineer'],
    },
    {
      step_id: 's4_record',
      step_type: 'write_memory',
      name: 'Store task outcome in project memory',
      config: {
        content: 'Feature X implemented and review approved.',
        kind: 'fact',
        scope: 'project',
      },
      depends_on: ['s3_review'],
    },
    {
      step_id: 's5_halt',
      step_type: 'halt',
      name: 'Done',
      config: {},
      depends_on: ['s4_record'],
    },
  ],
}

// 1. Register the definition with the in-process registry.
registry.register(implementFeature)

// 2. Create a workflow_runs row from the definition.
const run = await startWorkflow({
  workflow_name: 'implement_feature',
  workspace_id:  'ws_1',
  project_id:    'proj_1',
})

// 3. Drive it to completion. The runner owns state persistence and
//    telemetry; you just call and await.
const result = await runWorkflow({
  wf_id:        run.wf_id,
  workspace_id: 'ws_1',
})

console.log(result.final_status)  // 'completed' | 'blocked' | 'failed'
```

> The `${s1_plan.task_id}` placeholder is illustrative — in practice you bind prior step outputs inside a handler by reading `ctx.outputs[prior_step_id]`. The built-in handlers read `config` verbatim; if you need dynamic binding, write a small wrapper handler or thread `task_id` through the start-workflow `inputs` bag and materialise it at start time.

---

## Retries and timeouts

Both are configurable per step and globally defaulted.

| Setting | Global default | Per-step override |
|---------|----------------|-------------------|
| Max retries | `3` (`default_max_retries` on `runWorkflow`) | `max_retries` on the step def |
| Timeout (ms) | `600_000` (`default_timeout_ms` on `runWorkflow`) | `timeout_ms` on the step def |

On a `failed` result, the runner increments `state.attempts`, waits `min(1000 * 2^(attempts-1), backoff_cap)` ms, and retries. The backoff cap is **30 seconds** in production; tests override it via `retry_backoff_cap_ms` so they stay fast.

```text
attempt 1 → 1s
attempt 2 → 2s
attempt 3 → 4s
attempt 4 → 8s
...capped at 30s
```

Once `state.attempts >= max_retries`, the runner marks the step `failed`, persists, and halts the entire run with `final_status: 'failed'`.

---

## State persistence and resume

Every state transition calls `persistStates(wf_id, states, defs, status?, current_step)`, which writes a single atomic `UPDATE workflow_runs` that bumps the `version` column. Downstream observers see a consistent snapshot at each step boundary.

To **resume** a paused or blocked run, just call `runWorkflow` again:

```typescript
// Crash, restart, whatever — the steps column already has the partial state.
await runWorkflow({ wf_id: run.wf_id, workspace_id: 'ws_1' })
```

The runner hydrates `outputs` from prior `completed` steps, picks up where it left off, and re-opens its spans against the same `workspace_id`. Completed steps never re-run — `nextReadySteps` only returns nodes whose state is `pending` and whose dependencies are all `completed` or `skipped`.

---

## Error handling

The runner's final-status decision tree:

1. **Any step in state `failed`** → `final_status: 'failed'` (and the run row is marked `failed`).
2. **A `halt` step fired** (or any handler output has `halt: true`) → `final_status: 'completed'`.
3. **Every step terminal** (`completed` / `skipped` / `failed` with no failures) → `final_status: 'completed'`.
4. **Any step still `pending`** after a no-progress pass → `final_status: 'blocked'` (wait on external event, then resume).
5. Otherwise → `final_status: 'completed'`.

`StepResult` semantics:

- `completed` — output stored in `state.result` and hydrated into `ctx.outputs` for downstream steps; counts as progress.
- `skipped` — state flipped back to `pending`; the outer loop gets another shot next iteration. Used by `wait_for_*`, `loop`, and `gate`.
- `failed` — retries until budget exhausted, then halts the run with `failed`.

Handlers never throw out of the runner — `executeStep` catches any thrown error and converts it to `{ status: 'failed', error: err.message }`.

---

## Span instrumentation

The runner wraps everything in OpenTelemetry spans automatically. You don't instrument handlers yourself.

```text
workflow.run                        (root span, workspace_id, wf_id, final_status, steps_executed, duration_ms)
├── workflow.step  step_id=s1_plan  step_type=create_task  attempts=0  result_status=completed
├── workflow.step  step_id=s2_engineer  step_type=spawn_agent  result_status=completed
│   └── agent.run  role=software_engineer  adapter=stub     (opened by @fulcrum/worker)
├── workflow.step  step_id=s3_review  step_type=wait_for_review  result_status=skipped
├── workflow.step  step_id=s4_record  step_type=write_memory  result_status=completed
└── workflow.step  step_id=s5_halt  step_type=halt  result_status=completed
```

Every span lives in `trace_events` locally and dual-emits to OTLP if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. See [telemetry](./telemetry.md) for the exporter setup and the `gen_ai.*` attribute mapping.

---

## Best practices

- **Make handlers idempotent.** The runner retries on failure, crashes don't clean up in-flight side effects, and resuming re-reads the same blob. A handler that writes a row should `INSERT OR IGNORE` or check for an existing row first.
- **Keep steps small.** One step, one effect. Small steps give you a granular retry surface and a clean span tree for debugging.
- **Use `escalate` for human-in-the-loop.** Don't sprinkle `prompt_user` through the runner path — its handler short-circuits to `completed` because the real prompting happens in `stepWorkflow`. If you need a human to unblock a run, use `escalate` to hand off to `chief_of_staff`.
- **Use `wait_for_*` for async coordination.** When another process (another workflow, a reviewer, a merge queue) needs to do something before this run can progress, drop in a wait step. The runner correctly classifies the run as `blocked` and leaves it alone until you call `runWorkflow` again.
- **Prefer `depends_on` over sequential step order.** The runner walks the DAG — a well-factored `depends_on` graph gives you free parallelism.
- **Set realistic `max_retries` on costly steps.** The default of 3 means a failing `spawn_agent` step can burn 3× the compute before the run halts.
- **Register your workflow once per process.** `registry.register(def)` is process-global; tests and long-lived servers should register on module load.

---

## Related

- [README.md](../../README.md) — top-level overview
- [cli-reference.md](./cli-reference.md) — `fulcrum workflow` CLI commands
- [worker-adapters.md](./worker-adapters.md) — what happens inside `spawn_agent`
- [telemetry.md](./telemetry.md) — where `workflow.run` and `workflow.step` spans go
