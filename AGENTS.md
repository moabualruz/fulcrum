# Fulcrum ↔ Pi Architecture Boundary

## Fulcrum (this repo) — Control Plane

Fulcrum is a TypeScript SQLite library that manages **state, policy, and intent**.

- Records what work needs to happen (tasks, handoffs, workflows)
- Enforces policy (WIP limits, L1 team spawning, secret blocking)
- Tracks agent run lifecycle (created → running → completed/failed)
- Stores memory, artifacts, worktrees, reviews
- Emits events and metrics

**Fulcrum does NOT:**
- Spawn agent processes
- Make LLM API calls
- Route to Claude Code / Gemini CLI
- Manage OS-level processes

## Pi — Execution Layer

Pi is the runtime that **actually runs agents**. It:

- Resolves `AgentRole` → `pi_profile` (e.g. `claude-cli/claude-opus-4-5`)
- Calls `@fulcrum/core.startAgentRun()` to record intent
- Uses the returned `AgentRun.pi_profile` to spawn the agent process
- Calls `heartbeatAgentRun()` while the agent runs
- Calls `completeAgentRun()` or `blockAgentRun()` when done

## Integration Contract

```typescript
// Pi calls Fulcrum to create the run record:
const run = startAgentRun(db, {
  workspace_id, task_id, role: 'software_engineer',
  pi_profile: 'claude-cli/claude-opus-4-5',
  task_packet: { goal: 'implement feature X', task_type: 'implement' }
})

// Pi then uses run.pi_profile to spawn the actual agent:
const spawnable = buildSpawnableRun(run, task_packet)
// → Pi's executor.spawn(spawnable) [not in this repo]
```

## SpawnableRun

`SpawnableRun` is the typed handoff from Fulcrum → Pi. It contains everything Pi needs
to spawn an agent without reading additional state from the DB.
