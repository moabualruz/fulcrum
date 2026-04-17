# Worker Adapters

> Plug any agent runtime — Claude, Gemini, PI, or your own — into the `spawnAgent` lifecycle.

Fulcrum's worker layer is intentionally thin: a registry of named `AgentAdapter` objects and a lifecycle driver (`spawnAgent`) that handles policy, DB state, heartbeats, and telemetry. Your adapter only has to implement the `spawn(ctx)` method and translate between Fulcrum's contract and whatever agent runtime you're calling.

---

## The adapter contract

From `packages/worker/src/types.ts`:

```typescript
export interface AgentAdapter {
  name: string
  spawn(ctx: SpawnContext): Promise<WorkerResult>
}
```

That's the whole contract. Two properties. Every adapter in the process must have a unique `name` — that's the key the registry looks up by.

### `SpawnContext`

```typescript
export interface SpawnContext {
  run_id: string
  workspace_id: string
  project_id: string
  task_id: string
  role: AgentRole
  model: string | null
  handoff: HandoffPacket | null
  worktree_path: string | null
  heartbeat: (current_step: string, progress_pct?: number) => Promise<void>
}
```

| Field | Source | Notes |
|-------|--------|-------|
| `run_id` | `startAgentRun()` | Newly-minted `agent_runs.run_id` |
| `workspace_id` | caller | Always set |
| `project_id` | caller | Always set |
| `task_id` | caller | Must point at a real task row |
| `role` | caller's `target_role` | The role you're running |
| `model` | caller or `null` | Optional model hint |
| `handoff` | caller or `null` | Optional structured handoff packet |
| `worktree_path` | caller or `null` | Optional worktree path for isolated runs |
| `heartbeat(step, pct?)` | lifecycle | Calls `heartbeatAgentRun` under the hood |

The `heartbeat` callback is the only side channel between your adapter and the DB. Every heartbeat updates `agent_runs.current_step`, `progress_pct`, and `heartbeat_at`, and appends a `heartbeat` event to the row's `events` journal. `progress_pct` defaults to `0` when omitted. Call it whenever your underlying runtime emits progress — the monitor UI displays it live.

### `WorkerResult`

```typescript
export interface WorkerResult {
  status: 'completed' | 'blocked'
  summary?: string
  artifact_paths?: string[]
  tests_passed?: number
  tests_failed?: number
  error?: string
}
```

| Field | Effect |
|-------|--------|
| `status` | `'completed'` → `completeAgentRun`; `'blocked'` → `blockAgentRun` |
| `summary` | Human-readable summary string stored on the run |
| `artifact_paths` | Stored in `agent_runs.artifacts.files_changed` |
| `tests_passed` / `tests_failed` | Stored in `agent_runs.artifacts` |
| `error` | Used as `blockAgentRun` reason when `status='blocked'` |

The lifecycle driver translates this into `completeAgentRun` or `blockAgentRun` for you. You should **never** call those core functions from inside an adapter — return the structured result and let the driver handle persistence.

---

## Built-in adapters

Both ship registered at module load of `fulcrum-worker`.

### `stub` — test default

Source: `packages/worker/src/stub.ts`.

Reads a canned `WorkerResult` from `$FULCRUM_AGENT_STUB_DIR/<run_id>.json` if that file exists, otherwise emits a single `stub_finished` heartbeat and returns a generic `completed` result.

Use it in tests to pin deterministic outputs:

```bash
export FULCRUM_AGENT_STUB_DIR=/tmp/fulcrum-stub
mkdir -p $FULCRUM_AGENT_STUB_DIR

# Seed a canned result for a specific run_id the test will observe
cat > $FULCRUM_AGENT_STUB_DIR/run_abc.json <<'EOF'
{
  "status": "completed",
  "summary": "canned response",
  "artifact_paths": ["src/foo.ts"],
  "tests_passed": 12,
  "tests_failed": 0
}
EOF
```

When the adapter runs for `run_id=run_abc` it emits a `stub_started` heartbeat, reads the file, emits `stub_finished` at 100%, and returns the canned blob verbatim.

### `subprocess` — opt-in shell adapter

Source: `packages/worker/src/subprocess.ts`.

Runs `$FULCRUM_AGENT_SUBPROCESS_CMD` via `execFile` with the spawn context surfaced as env vars. Parses the child process stdout as JSON; falls back to a plain-text `summary` if parsing fails. Non-zero exit codes become `{ status: 'blocked', error: <message> }`.

Env vars passed to the subprocess:

| Variable | Value |
|----------|-------|
| `FULCRUM_RUN_ID` | `ctx.run_id` |
| `FULCRUM_ROLE` | `ctx.role` |
| `FULCRUM_WORKSPACE_ID` | `ctx.workspace_id` |
| `FULCRUM_PROJECT_ID` | `ctx.project_id` |
| `FULCRUM_TASK_ID` | `ctx.task_id` |
| `FULCRUM_MODEL` | `ctx.model ?? ''` |
| `FULCRUM_WORKTREE_PATH` | `ctx.worktree_path ?? ''` |

Example wiring:

```bash
export FULCRUM_AGENT_ADAPTER=subprocess
export FULCRUM_AGENT_SUBPROCESS_CMD="python3 /opt/bridges/pi_runner.py"

fulcrum agent spawn \
  --target-role software_engineer \
  --caller-role chief_of_staff \
  --task-id task_abc
```

Your `pi_runner.py` reads the Fulcrum env vars, does its thing, and prints a JSON blob matching `WorkerResult` to stdout.

---

## Registering a custom adapter

`registerAgentAdapter` adds (or overwrites) an entry in the process-global adapter registry:

```typescript
import { registerAgentAdapter } from 'fulcrum-worker'

registerAgentAdapter({
  name: 'claude-sdk',
  async spawn(ctx) {
    await ctx.heartbeat('starting', 0)
    // 1. Call your agent runtime (Anthropic SDK, Gemini SDK, custom HTTP, ...)
    // 2. Stream events, call ctx.heartbeat() as progress happens
    // 3. Return a WorkerResult with final status + summary + artifacts
    return {
      status: 'completed',
      summary: 'Claude finished the task',
      artifact_paths: ['src/foo.ts'],
    }
  },
})
```

Where to register:

- **Monorepo-wide**: at the top of a bootstrap file that your CLI/server imports early. Registering once per process is enough.
- **Per-test**: inside a `beforeEach` that re-registers a deterministic stub under the name your test uses.
- **Dynamic loading**: scan a directory at startup and `registerAgentAdapter` each module's default export.

Re-registering the same name overwrites the previous entry — handy for tests, risky in production.

---

## Policy gate

`spawnAgent` enforces `canInvokeTeams(caller_role)` **before** resolving the adapter. Only L1 roles — `chief_of_staff`, `team_lead`, `workflow_coordinator`, and any role in the `can_invoke_teams` set — may call it. Everything else gets a `FulcrumError('policy_denied')` at the top of the function:

```typescript
if (!canInvokeTeams(input.caller_role)) {
  throw new FulcrumError(
    `role '${input.caller_role}' lacks can_invoke_teams`,
    'policy_denied',
  )
}
```

Your adapter never sees the call. This means:

- L0 roles cannot escape into subordinate agents by any path that goes through `spawnAgent`.
- You can't bypass the gate by passing a fake `target_role`. The gate is on `caller_role`.
- If you want an adapter that runs with no caller (e.g. a cron worker), you still need to pass a caller role that's on the allowlist — usually `chief_of_staff`.

---

## Lifecycle wiring

Full flow of a `spawnAgent` call (`packages/worker/src/lifecycle.ts`):

1. **Policy check** — `canInvokeTeams(caller_role)` or throw.
2. **Adapter resolution** — `input.adapter ?? process.env.FULCRUM_AGENT_ADAPTER ?? 'stub'`. Throws `FulcrumError('not_found')` if the name isn't registered.
3. **`startAgentRun({ task_id, role, workspace_id })`** — creates the `agent_runs` row and returns `{run_id, ...}`.
4. **`startSpan({ name: 'agent.run', workspace_id, run_id, payload: { role, adapter, model, caller_role } })`** — opens telemetry (see below).
5. **Build `SpawnContext`** with a `heartbeat` closure that calls `heartbeatAgentRun({ run_id, current_step, progress_pct: progress_pct ?? 0 })`.
6. **`adapter.spawn(ctx)`** wrapped in try/catch. Any thrown error becomes `{ status: 'blocked', error: err.message }`, so runs never leak in the `running` state.
7. **Persist terminal state**:
   - `completed` → `completeAgentRun({ run_id, output_summary, artifacts })`
   - `blocked`   → `blockAgentRun({ run_id, reason: error ?? 'adapter reported blocked status' })`
8. **`endSpan`** with the final status and a payload containing `{ status, summary, error }`.

Heartbeats are journalled to `agent_runs.events` throughout the run. The monitor UI streams them via SSE, so you can watch a long-running agent tick through its steps in real time.

---

## Span instrumentation

`spawnAgent` opens one `agent.run` span per call:

```text
agent.run   workspace_id=ws_1   run_id=run_abc
            role=software_engineer   adapter=claude-sdk
            model=claude-3-7-sonnet  caller_role=chief_of_staff
            status=ok                summary=...
```

Spans dual-emit to the local `trace_events` table and to OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. The payload mapping in `telemetry/otel.ts` emits these on agent spans as OTel attributes:

| Payload field | OTel attribute |
|---------------|----------------|
| `role` / `target_role` | `gen_ai.agent.name` |
| `model` | `gen_ai.request.model` |
| `adapter` | `gen_ai.system` (prefixed with `fulcrum.`) |
| everything else | `fulcrum.<field>` |

You **do not** manage the span yourself. Do not call `startSpan` / `endSpan` inside an adapter for the top-level run — the lifecycle already owns it. If your adapter wants to emit child spans (e.g. one per LLM call), pass `parent_span_id` based on the `run_id` lookup or just call `startSpan` with the workspace and the runner's span will resolve as the trace parent in OTel.

---

## Example: minimal Claude CLI adapter

Shells out to the `claude` CLI, captures its JSON output, and surfaces it as a `WorkerResult`:

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerAgentAdapter } from 'fulcrum-worker'

const execFileAsync = promisify(execFile)

registerAgentAdapter({
  name: 'claude-cli',
  async spawn(ctx) {
    await ctx.heartbeat('claude_starting', 0)

    const goal = ctx.handoff?.goal ?? `Run ${ctx.role} on task ${ctx.task_id}`

    try {
      const { stdout } = await execFileAsync(
        'claude',
        ['--print', '--output-format', 'json', goal],
        {
          env: {
            ...process.env,
            FULCRUM_RUN_ID: ctx.run_id,
            FULCRUM_ROLE: ctx.role,
          },
          cwd: ctx.worktree_path ?? process.cwd(),
          maxBuffer: 16 * 1024 * 1024,
        },
      )

      await ctx.heartbeat('claude_done', 100)

      // Claude's JSON payload has `{ result, is_error, ... }`.
      const payload = JSON.parse(stdout) as { result: string; is_error?: boolean }
      return {
        status: payload.is_error ? 'blocked' : 'completed',
        summary: payload.result,
      }
    } catch (err) {
      return { status: 'blocked', error: (err as Error).message }
    }
  },
})
```

Select it per call or per process:

```bash
# Per-call
fulcrum agent spawn \
  --target-role software_engineer \
  --caller-role chief_of_staff \
  --task-id task_abc \
  --adapter claude-cli

# Process-wide default
export FULCRUM_AGENT_ADAPTER=claude-cli
```

---

## Example: PI bridge adapter

If you're running Fulcrum alongside PI, you can delegate to PI's RPC bridge instead of reinventing the spawning protocol. This sketch assumes a locally-running PI bridge that accepts a JSON request over stdin:

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerAgentAdapter } from 'fulcrum-worker'

const execFileAsync = promisify(execFile)

registerAgentAdapter({
  name: 'pi-bridge',
  async spawn(ctx) {
    await ctx.heartbeat('pi_starting', 0)

    const request = JSON.stringify({
      run_id: ctx.run_id,
      role: ctx.role,
      task_id: ctx.task_id,
      worktree: ctx.worktree_path,
      handoff: ctx.handoff,
    })

    try {
      const { stdout } = await execFileAsync('pi', ['bridge', 'spawn'], {
        input: request,
        maxBuffer: 32 * 1024 * 1024,
      } as unknown as Parameters<typeof execFileAsync>[2])

      await ctx.heartbeat('pi_done', 100)
      const result = JSON.parse(stdout)
      return {
        status: result.ok ? 'completed' : 'blocked',
        summary: result.summary ?? '',
        artifact_paths: result.files_changed ?? [],
        tests_passed: result.tests?.passed,
        tests_failed: result.tests?.failed,
      }
    } catch (err) {
      return { status: 'blocked', error: (err as Error).message }
    }
  },
})
```

---

## Selecting an adapter per call

Two ways:

```bash
# 1. Explicit per-call
fulcrum agent spawn --adapter claude-cli --target-role software_engineer ...

# 2. Env var default (all calls in this process)
export FULCRUM_AGENT_ADAPTER=claude-cli
```

Resolution order inside `spawnAgent`:

```text
input.adapter
  ?? process.env.FULCRUM_AGENT_ADAPTER
  ?? 'stub'
```

If the resolved name isn't registered, `spawnAgent` throws `FulcrumError('unknown agent adapter', 'not_found')` before any DB writes happen.

---

## Related

- [README.md](../../README.md) — top-level overview
- [installation.md](./installation.md) — `FULCRUM_AGENT_*` environment variables
- [cli-reference.md](./cli-reference.md) — `fulcrum agent spawn` and `workflow run`
- [workflow-authoring.md](./workflow-authoring.md) — how `spawn_agent` steps call `spawnAgent`
- [telemetry.md](./telemetry.md) — `agent.run` span attributes and OTLP export
