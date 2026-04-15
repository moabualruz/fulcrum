# @fulcrum/worker

Pluggable agent execution layer for Fulcrum. Provides the `spawnAgent` lifecycle driver and an `AgentAdapter` contract for running subordinate agents.

## What it does

- **`spawnAgent(input)`** — policy-checked agent run lifecycle: create DB row → call adapter → heartbeat → complete/block
- **`AgentAdapter` contract** — one method (`spawn`) receives a `SpawnContext` with heartbeat callback, returns `WorkerResult`
- **Built-in adapters** — `stub` (reads canned JSON for tests), `subprocess` (runs a CLI command), `claudeCodeAdapter` (Claude Code subprocess)
- **`registerAgentAdapter(adapter)`** — extension point for userland adapters (Gemini CLI, PI, custom SDKs)

## Usage

```typescript
import { spawnAgent, registerAgentAdapter } from '@fulcrum/worker'

// Use the built-in subprocess adapter
const result = await spawnAgent({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  task_id:      'task_01j...',
  caller_role:  'chief_of_staff',
  target_role:  'software_engineer',
  adapter:      'subprocess',
})

// Register a custom adapter
registerAgentAdapter({
  name: 'my-agent',
  async spawn(ctx) {
    await ctx.heartbeat('starting', 0)
    // ... run your agent ...
    return { status: 'completed', summary: 'done', artifact_paths: ['src/foo.ts'] }
  },
})
```

## Adapter contract

```typescript
interface AgentAdapter {
  name: string
  spawn(ctx: SpawnContext): Promise<WorkerResult>
}

interface SpawnContext {
  run_id:        string
  workspace_id:  string
  project_id:    string
  task_id:       string
  role:          AgentRole
  model:         string | null
  handoff:       HandoffPacket | null
  worktree_path: string | null
  heartbeat(step: string, pct?: number): Promise<void>
}

interface WorkerResult {
  status:         'completed' | 'blocked'
  summary?:       string
  artifact_paths?: string[]
  tests_passed?:  number
  tests_failed?:  number
  error?:         string
}
```

## Subprocess adapter

Set `FULCRUM_AGENT_SUBPROCESS_CMD` to the command to execute. Fulcrum passes `SpawnContext` fields as environment variables (`FULCRUM_RUN_ID`, `FULCRUM_WORKSPACE_ID`, etc.) and expects a `WorkerResult` JSON on stdout when the process exits.

```bash
FULCRUM_AGENT_SUBPROCESS_CMD="claude --dangerously-skip-permissions" \
  fulcrum agent spawn --caller-role chief_of_staff --target-role software_engineer \
    --task-id task_01j... --workspace-id ws_1 --project-id proj_1 --adapter subprocess
```

## Stub adapter (tests)

Place `<run_id>.json` files in `$FULCRUM_AGENT_STUB_DIR`. The stub adapter reads and returns the JSON as `WorkerResult`. Useful for deterministic tests without spawning real agents.
